"use client";

import { usePasteImage } from "@/lib/usePasteImage";
import { useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";

/**
 * WYSIWYG mínimo (títulos, negrita, listas, imágenes) sobre Tiptap. Guarda
 * HTML en un input oculto para que funcione con los mismos <form
 * action={serverAction}> ya usados en toda la app, sin volverlo un form
 * controlado aparte.
 */
export function RichTextEditor({ name, defaultValue }: { name: string; defaultValue: string | null }) {
  // Estado (no escribir en el input por DOM): cada re-render del editor devolvía el input oculto a su
  // defaultValue y la descripción escrita no llegaba al enviar el formulario.
  const [html, setHtml] = useState(defaultValue ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  usePasteImage(fileInputRef);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Image],
    content: defaultValue ?? "",
    editorProps: {
      attributes: {
        // Explícitos y desde el origen: el script global que activa el corrector
        // al enfocar no alcanzaba en este editor (la descripción no subrayaba
        // palabras mal escritas). Aquí quedan puestos desde que se crea.
        spellcheck: "true",
        lang: "es",
        class: "prose prose-sm max-w-none min-h-32 rounded-b-lg border border-t-0 border-slate-300 px-3 py-2 focus:outline-none [&_img]:rounded-lg [&_img]:max-w-full",
      },
    },
    onUpdate: ({ editor }) => {
      setHtml(editor.getHTML());
    },
  });

  async function handleImageUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !editor) return;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const body = await res.json();
    if (res.ok && body.mimeType?.startsWith("image/")) {
      editor.chain().focus().setImage({ src: body.url }).run();
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (!editor) return null;

  const btn = (active: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded text-sm ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`;

  return (
    // data-paste-zone: el contorno de "Ctrl+V para pegar aquí" se limita al editor (sin él tomaba el formulario entero).
    <div data-paste-zone>
      <input type="hidden" name={name} value={html} readOnly />
      <div className="flex flex-wrap items-center gap-1 rounded-t-lg border border-slate-300 bg-slate-50 p-1">
        <button type="button" title="Negrita" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive("bold"))}>
          <span className="font-bold">B</span>
        </button>
        <button type="button" title="Cursiva" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive("italic"))}>
          <span className="italic">I</span>
        </button>
        <button type="button" title="Título" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive("heading", { level: 2 }))}>
          <span className="text-xs font-bold">H2</span>
        </button>
        <button type="button" title="Subtítulo" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive("heading", { level: 3 }))}>
          <span className="text-xs font-bold">H3</span>
        </button>
        <button type="button" title="Lista" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive("bulletList"))}>
          <ListIcon className="h-4 w-4" />
        </button>
        <button type="button" title="Insertar imagen" onClick={() => fileInputRef.current?.click()} className={btn(false)}>
          <ImageIcon className="h-4 w-4" />
        </button>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleImageUpload} />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12M8.25 17.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  );
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 19.5h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  );
}
