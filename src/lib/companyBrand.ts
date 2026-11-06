import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { findUploadPath } from "@/lib/persistentUploads";
import { saveUploadedFile } from "@/lib/uploadFile";
import { DEFAULT_THEME, type DocTheme, type DocImage } from "@/lib/botFileCreate";
import { BRAND_FIELD_LABEL, BRAND_TEXT_FIELDS, type BrandInput, type CompanyBrandData } from "@/lib/companyBrandFields";

export { BRAND_FIELD_LABEL, BRAND_TEXT_FIELDS, type BrandInput, type CompanyBrandData };

export const BRAND_ID = "main";
const HEX = /^#[0-9a-f]{6}$/i;

export function normalizeHex(value: string | null | undefined): string | null | "invalid" {
  const v = value?.trim();
  if (!v) return null;
  const withHash = v.startsWith("#") ? v : `#${v}`;
  const expanded = /^#[0-9a-f]{3}$/i.test(withHash) ? `#${withHash.slice(1).split("").map((c) => c + c).join("")}` : withHash;
  return HEX.test(expanded) ? expanded.toUpperCase() : "invalid";
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function hasBrand(brand: CompanyBrandData | null) {
  return Boolean(brand && (brand.logoPngUrl || brand.iconPngUrl || brand.primaryColor || brand.secondaryColor || BRAND_TEXT_FIELDS.some((f) => brand[f])));
}

export function brandFooter(brand: CompanyBrandData): string[] {
  const legal = [brand.legalName, brand.taxId && `NIT ${brand.taxId}`].filter(Boolean).join(" · ");
  const place = [brand.address, brand.city].filter(Boolean).join(", ");
  const contact = [place, brand.phone, brand.email, brand.website].filter(Boolean).join(" · ");
  return [legal, contact].filter(Boolean) as string[];
}

export function themeColors(brand: CompanyBrandData): Omit<DocTheme, "logo" | "icon" | "footer"> {
  const ink = `#${DEFAULT_THEME.ink}`;
  const primary = brand.primaryColor;
  const secondary = brand.secondaryColor;
  const strip = (h: string) => h.replace("#", "").toUpperCase();
  return {
    ...DEFAULT_THEME,
    heading: primary && contrastRatio(primary, "#FFFFFF") >= 3 ? strip(primary) : DEFAULT_THEME.heading,
    headerFill: primary ? strip(primary) : DEFAULT_THEME.headerFill,
    headerText: primary ? (contrastRatio(primary, "#FFFFFF") >= contrastRatio(primary, ink) ? "FFFFFF" : DEFAULT_THEME.ink) : DEFAULT_THEME.headerText,
    line: secondary ? strip(secondary) : primary ? strip(primary) : DEFAULT_THEME.line,
  };
}

async function loadImage(url: string | null): Promise<DocImage | undefined> {
  if (!url) return undefined;
  try {
    const filePath = await findUploadPath(url);
    if (!filePath) return undefined;
    const data = await readFile(filePath);
    const sharp = (await import("sharp")).default;
    const meta = await sharp(data).metadata();
    if (!meta.width || !meta.height) return undefined;
    return { data, width: meta.width, height: meta.height };
  } catch (err) {
    console.error("[identidad] no se pudo leer la imagen", url, err);
    return undefined;
  }
}

export async function getCompanyBrand(): Promise<CompanyBrandData | null> {
  return readCompanyBrand().catch((err) => {
    console.error("[identidad] no se pudo leer la identidad", err);
    return null;
  });
}

async function readCompanyBrand(): Promise<CompanyBrandData | null> {
  return prisma.companyBrand.findUnique({
    where: { id: BRAND_ID },
    select: { logoUrl: true, logoPngUrl: true, iconUrl: true, iconPngUrl: true, primaryColor: true, secondaryColor: true, legalName: true, taxId: true, address: true, city: true, phone: true, email: true, website: true },
  });
}

export async function getDocTheme(): Promise<DocTheme | null> {
  const brand = await getCompanyBrand().catch((err) => {
    console.error("[identidad] no se pudo leer la identidad", err);
    return null;
  });
  if (!brand || !hasBrand(brand)) return null;
  const [logo, icon] = await Promise.all([loadImage(brand.logoPngUrl), loadImage(brand.iconPngUrl)]);
  return { ...themeColors(brand), logo, icon: icon ?? logo, footer: brandFooter(brand) };
}

export async function toPngUpload(url: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const filePath = await findUploadPath(url);
  if (!filePath) return { ok: false, error: "El archivo de la imagen ya no existe." };
  try {
    const sharp = (await import("sharp")).default;
    const source = await readFile(filePath);
    const meta = await sharp(source).metadata();
    const longest = Math.max(meta.width ?? 0, meta.height ?? 0) || 800;
    const density = meta.format === "svg" ? Math.min(300, Math.max(1, (72 * 1600) / longest)) : undefined;
    const png = await sharp(source, density ? { density } : {}).resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    const saved = await saveUploadedFile(new File([new Uint8Array(png)], "identidad.png", { type: "image/png" }));
    return saved.ok ? { ok: true, url: saved.url } : { ok: false, error: saved.error };
  } catch (err) {
    console.error("[identidad] no se pudo convertir la imagen", err);
    return { ok: false, error: "La imagen no se pudo leer. Probar con un PNG o JPG." };
  }
}


export async function saveCompanyBrand(input: BrandInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const data: Record<string, string | null> = {};
  for (const key of ["primaryColor", "secondaryColor"] as const) {
    if (!(key in input)) continue;
    const hex = normalizeHex(input[key]);
    if (hex === "invalid") return { ok: false, error: `El ${key === "primaryColor" ? "color principal" : "color secundario"} no es válido. Se escribe así: #0A6B78.` };
    data[key] = hex;
  }
  for (const key of BRAND_TEXT_FIELDS) if (key in input) data[key] = input[key]?.trim().slice(0, 190) || null;
  for (const [field, pngField] of [["logoUrl", "logoPngUrl"], ["iconUrl", "iconPngUrl"]] as const) {
    if (!(field in input)) continue;
    const url = input[field];
    if (!url) {
      data[field] = null;
      data[pngField] = null;
      continue;
    }
    if (!/^\/uploads\/[A-Za-z0-9._-]+$/.test(url)) return { ok: false, error: "La imagen no es válida." };
    const png = await toPngUpload(url);
    if (!png.ok) return png;
    data[field] = url;
    data[pngField] = png.url;
  }
  await prisma.companyBrand.upsert({ where: { id: BRAND_ID }, create: { id: BRAND_ID, ...data }, update: data });
  return { ok: true };
}

export function brandView(brand: CompanyBrandData | null) {
  if (!brand || !hasBrand(brand)) return null;
  return {
    colorPrincipal: brand.primaryColor,
    colorSecundario: brand.secondaryColor,
    logo: brand.logoPngUrl,
    icono: brand.iconPngUrl,
    ...Object.fromEntries(BRAND_TEXT_FIELDS.filter((f) => brand[f]).map((f) => [BRAND_FIELD_LABEL[f], brand[f]])),
  };
}
