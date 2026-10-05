"use client";

// Último recurso: si falla el layout raíz. Lleva su propio <html>/<body> y estilos en línea
// porque reemplaza al layout (no recibe los estilos globales).
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f8fafc", margin: 0 }}>
        <div style={{ maxWidth: 420, margin: "64px auto", padding: 24, background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", textAlign: "center" }}>
          <h2 style={{ fontSize: 18, margin: 0, color: "#0f172a" }}>No se pudo cargar la aplicación</h2>
          <p style={{ fontSize: 14, color: "#475569" }}>Ocurrió un problema inesperado. Se puede reintentar; si se repite, conviene avisar al administrador.</p>
          <button type="button" onClick={() => retry()} style={{ background: "#0a6b78", color: "#fff", border: 0, borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>
            Reintentar
          </button>
          {error.digest && <p style={{ fontSize: 12, color: "#94a3b8" }}>Código para soporte: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
