export default function AboutSettingsPage() {
  return (
    <section className="space-y-10 rounded-3xl border border-slate-100 bg-white p-6 sm:p-8">
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- ícono estático de la app (el mismo de la instalación) */}
            <img src="/icons/pm-192.png" alt="" className="h-12 w-12 rounded-xl" />
            <p className="font-display font-black text-xl tracking-[-0.02em] text-slate-900">
              ProjectManager<span className="text-[color:var(--sand-warm)]">SK</span>
            </p>
          </div>
          <div className="space-y-1 mb-8">
            <h3 className="text-center font-bold text-slate-900 mb-4">¿Qué es?</h3>
            <p className="mx-auto text-center text-balance text-sm text-slate-600">
              Una aplicación para llevar cada proyecto de principio a fin: qué se quiere lograr, qué hay que hacer, quién lo hace y
              para cuándo. Avisa a tiempo cuando algo se atrasa y deja al cliente participar desde un link, sin crear una cuenta.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="text-center font-bold text-slate-900 mb-4">¿Qué se puede hacer?</h3>
            <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
              {APP_FEATURES.map((f) => (
                <li key={f.title} className="text-center text-sm sm:text-left">
                  <p className="font-medium text-slate-800">
                    <span aria-hidden className="mr-1.5">{f.icon}</span>
                    {f.title}
                  </p>
                  <p className="whitespace-pre-line text-balance text-slate-500">{f.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center space-y-3 border-t border-slate-100 pt-10 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático de marca, no aplica optimización de next/image */}
          <img src="/brand/logo-elan-sk-soft.svg" alt="Elan SK Soft" className="mx-auto h-24" />
          <h2 className="font-black text-xl text-slate-900">ProjectManagerSK</h2>
          <p className="max-w-md text-sm text-slate-600 text-balance">
            Es un producto de <b>Elan-SK Soft</b>, elaborado por <b>ELAN-SK</b>, para organizar proyectos, tareas y tiempos del equipo en un solo lugar.
          </p>
          <p className="text-sm text-slate-600">
            Contacto:{" "}
            <a href="mailto:elan-sk@hotmail.com" className="text-slate-900 underline hover:text-slate-700">
              elan-sk@hotmail.com
            </a>
          </p>
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} Elaborado por ELAN-SK <br/> Todos los derechos reservados.</p>
        </div>
      </section>
  );
}

// Resumen de lo que ofrece la app, para la tarjeta «Sobre ProjectManagerSK».
const APP_FEATURES = [
  { icon: "🎯", title: "Definir el proyecto", text: "Objetivos, requerimientos y fases, con el avance de cada uno calculado a partir de sus tareas." },
  { icon: "🗂️", title: "Planear y seguir tareas", text: "Tablero, cronograma con dependencias y calendario; tareas con checklist, insumos y resultados." },
  { icon: "🔎", title: "Buscador avanzado", text: "Busca por proyectos, tareas y el resto; además se pueden combinar filtros como estados: o etiquetas:." },
  { icon: "✅", title: "Revisar la calidad", text: "Pruebas con plantillas y rondas de revisión, Ajustes y Aceptaciones que califica el cliente." },
  { icon: "🔗", title: "Trabajar con el cliente", text: "Links compartidos para ver el avance, comentar, responder preguntas y subir insumos." },
  { icon: "⏳", title: "Anticipar atrasos", text: "Alertas por tarea y el estado del proyecto: retraso u holgura frente a la fecha de cierre." },
  { icon: "📊", title: "Medir el rendimiento", text: "Cumplimiento a tiempo, carga del equipo, calidad de las revisiones y uso de la app." },
  { icon: "💬", title: "Avisos por WhatsApp", text: "Asignaciones, vencimientos, resumen diario y alertas al grupo de cada proyecto." },
  { icon: "🤖", title: "Asistente con IA", text: "Responde sobre proyectos y tiempos, y hace cambios con confirmación; también se conecta con Claude." },
  { icon: "📁", title: "Archivos en orden", text: "Galería por proyecto, sin archivos repetidos y con el detalle de dónde se usa cada uno." },
  { icon: "🔐", title: "Contraseñas seguras", text: "Accesos guardados cifrados, visibles solo para quien corresponda, con botón de copiar e historial de quién los vio." },
  { icon: "⌨️", title: "Atajos de teclado", text: "Ctrl + Espacio: buscar\nAlt + C: chat\nAlt + L: leer respuesta" },
];
