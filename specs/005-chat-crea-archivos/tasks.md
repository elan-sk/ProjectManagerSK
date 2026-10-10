# Tareas 005 — El chat crea archivos

- [x] **T1. Instalar `docx`, `pdfkit`, `@types/pdfkit` y `pptxgenjs`; `pdfkit` como paquete externo del servidor.** RF-2
  - Hecho cuando: las dependencias están en `package.json` y `npx tsc --noEmit` pasa.
- [x] **T2. Chequeo `scripts/verify-bot-create-file.ts` y script `verify:bot-create-file`.** RF-2, RF-7 a RF-11, RF-13
  - Hecho cuando: el chequeo existe y falla porque todavía no hay módulo.
- [x] **T3. Módulo `src/lib/botFileCreate.ts`: texto tal cual, Word y Excel.** RF-2, RF-7, RF-8, RF-10, RF-11, RF-13
  - Hecho cuando: la parte de texto, Word y Excel del chequeo pasa.
- [x] **T4. PDF y PowerPoint en `botFileCreate.ts`.** RF-7, RF-9, RF-10
  - Hecho cuando: `npm run verify:bot-create-file` pasa completo.
- [x] **T5. Herramienta `create_file` en `chontatecTools.ts` con permiso de HTML y guardado.** RF-1, RF-4, RF-5, RF-12, RF-15, RF-16, RF-17
  - Hecho cuando: `npx tsc --noEmit` pasa y la herramienta está en `READ_TOOLS`.
- [x] **T6. Respuesta cortada: `botOpenAI.ts`, ciclo del chat y regla «Archivos».** RF-1, RF-13, RF-14
  - Hecho cuando: `npm run verify:bot-openai` pasa con el caso nuevo.
- [x] **T7. Validación: tsc, lint, todos los `verify:*` del chat y repaso del inventario.**
  - Hecho cuando: todo en verde y la tabla de validación está completa.
