export const BRAND_TEXT_FIELDS = ["legalName", "taxId", "address", "city", "phone", "email", "website"] as const;
export type BrandTextField = (typeof BRAND_TEXT_FIELDS)[number];
export const BRAND_FIELD_LABEL: Record<BrandTextField, string> = {
  legalName: "Razón social",
  taxId: "NIT",
  address: "Dirección",
  city: "Ciudad",
  phone: "Teléfono",
  email: "Correo",
  website: "Sitio web",
};

export type CompanyBrandData = {
  logoUrl: string | null;
  logoPngUrl: string | null;
  iconUrl: string | null;
  iconPngUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
} & Record<BrandTextField, string | null>;

export type BrandInput = Partial<Record<BrandTextField | "primaryColor" | "secondaryColor", string | null>> & { logoUrl?: string | null; iconUrl?: string | null };
