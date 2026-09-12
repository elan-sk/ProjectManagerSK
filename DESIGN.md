---
name: ProjectManagerSK
description: Gestión de proyectos con la precisión serena de una bitácora del Pacífico colombiano.
colors:
  ocean-deep: "#073b4c"
  ocean-deep-mid: "#0a5866"
  tide-teal: "#0a6b78"
  sea-foam: "#d9eeea"
  pale-foam: "#b9ded7"
  coast-mist: "#edf5f2"
  tide-light: "#58aeb0"
  tide-highlight: "#78c7c3"
  ambient-tide: "rgba(47, 153, 158, 0.15)"
  focus-tide: "rgba(8, 125, 145, 0.85)"
  canopy-green: "#17664e"
  sun-sand: "#e5c979"
  mist-surface: "#e7f2ef"
  ink: "#102f3d"
  deep-ink: "#09242e"
  scroll-track: "#9cbdb8"
  scroll-track-hover: "#5d8c8b"
  white: "#ffffff"
  alert-red: "#b83b35"
  alert-amber: "#9c6811"
  project-identity: ["#0a6b78", "#17664e", "#1f4e70", "#7a4f9e", "#a3455f", "#8c7a2b"]
typography:
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "Space Grotesk, Geist, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 600
    letterSpacing: "-0.02em"
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
rounded:
  micro: "0.2rem"
  brand: "0.7rem 0.7rem 0.7rem 0.2rem"
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ocean-deep}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  field-default:
    backgroundColor: "{colors.mist-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
---

# Design System: ProjectManagerSK

## Overview

**Creative North Star: "Bitácora de marea"**

ProjectManagerSK es una herramienta operativa, no una postal turística. Su identidad toma del Pacífico colombiano la convivencia real entre mar profundo, bruma, selva y luz tropical, y la traduce a una interfaz de alta legibilidad para planear y controlar trabajo.

La expresión debe ser sobria y concentrada: superficies claras de bruma, tipografía limpia, jerarquía firme y color saturado únicamente cuando guía una acción, un estado o una zona de navegación. La línea de marea en el encabezado es la firma persistente del sistema.

**Key Characteristics:**

- Azul petróleo como autoridad — ya no solo en acentos: el encabezado lo lleva como color comprometido (estrategia "Committed", 30–60% de esa franja), a la manera de un puente de mando.
- Verde selva para avance exitoso; amarillo arena para atención; coral para urgencia.
- El fondo general es agua, no un lienzo neutro: bruma con tinte de marea perceptible, nunca blanco genérico.
- Densidad tranquila: los datos se escanean, no se exhiben como métricas de mercadeo.
- Detalles regionales abstractos (línea de marea, oleaje del login), sin iconografía folclórica ni patrones decorativos.

## Colors

La paleta conserva las familias semánticas existentes y cambia solo sus tonalidades hacia un Pacífico húmedo y elegante.

### Primary

- **Océano profundo** (`#073b4c`): ancla del encabezado (`.pacific-header`, degradado hacia `#0a5866`/marea turquesa), acciones primarias, texto de máxima importancia.
- **Marea turquesa** (`#0a6b78`): foco, navegación activa e información de progreso.

### Secondary

- **Selva Chocó** (`#17664e`): estados de completado, éxito y progreso confirmado.
- **Arena de sol** (`#e5c979`): marca del encabezado (fondo de `.pacific-brand-mark` e hipervínculos al pasar el cursor sobre fondo oscuro) y línea de marea; no usar como fondo de lectura extensa.

### Neutral

- **Bruma costera** (`#dcece6`): fondo general (`--background` / `slate-50`) — con presencia visible de marea, no un gris casi blanco.
- **Espuma** (`#d9eeea`): superficies auxiliares y selección suave.
- **Espuma pálida** (`#b9ded7`): selección de texto y estados ambientales de baja intensidad.
- **Tinta marina** (`#102f3d`): texto principal.

### Identidad de proyectos y personas

Un proyecto se identifica solo por su nombre y su ícono (punto confirmado con el usuario: probó un color de fondo elegible por proyecto — tarjeta de resumen, vista completa del proyecto, encabezado de tarea — y decidió que no aportaba y que nombre + ícono ya alcanzan). No existe un selector de color de proyecto ni un fondo de color en ninguna de esas superficies; el ícono (imagen propia o el cuadrado con inicial de respaldo) se agrandó en su lugar para que tenga más presencia junto al nombre y el cliente.

Cada persona sí recibe un color propio (hash determinístico del nombre) solo para identificarse de un vistazo en su avatar — nunca para transmitir estado. Siempre en hex explícito (`style`, no clase de Tailwind): cualquier familia de color de Tailwind sin retonalizar en `globals.css` (rose, violet, teal, fuchsia, purple, indigo, cyan, sky, pink) se ve fuera de lugar en cuanto aparece, así que esta paleta nunca depende de esas clases.

- **Proyectos, respaldo del ícono con inicial** (`ProjectIcon.tsx` → `DEFAULT_COLORS`): marea, selva, océano profundo, orquídea, berry y oro mate — el único color que le queda a un proyecto sin ícono propio.
- **Personas, avatar con inicial** (`Avatar.tsx` → `AVATAR_COLORS`): marea, selva, añil oceánico, orquídea, berry y turquesa-esmeralda.
- **Filtro sin color propio** (`ComboFilter.tsx`, botón con valor elegido y sin `triggerColorClass`): marea (`#0a6b78`), no un morado genérico de librería.

Ninguna de las dos reutiliza el rojo/ámbar exactos de alerta.

### Named Rules

**La regla de señales conservadas.** Rojo sigue significando urgencia, ámbar advertencia, azul información/inicio tardío y verde éxito. Se pueden ajustar sus tonos, nunca reutilizar un color de alerta como acento decorativo — la identidad de personas (`Avatar.tsx`) vive deliberadamente en otras familias de matiz.

**La regla de color contenido.** Fuera del encabezado (que sí es un bloque de color comprometido), una pantalla operativa usa el océano y los neutros como base; los demás colores aparecen por significado, no por relleno.

## Typography

**Body Font:** Geist, con `ui-sans-serif` y sistema como respaldo — sigue llevando todo el contenido operativo, formularios y controles.

**Display Font:** Space Grotesk (`--font-display`), aplicada globalmente a `h1`/`h2` vía CSS (nunca clase por clase). Geométrica y con carácter propio — la voz de "bitácora de instrumentos" del sistema — sin tocar la velocidad de lectura del cuerpo, que se queda en Geist.

**Character:** La tipografía es nítida, contemporánea y compacta. Los títulos usan Space Grotesk con tracking ligeramente cerrado para dar autoridad y un punto de carácter, sin volverse ornamental.

### Hierarchy

- **Title** (Space Grotesk, 600, tracking `-0.02em`): títulos de vistas, proyectos y secciones importantes (cualquier `h1`/`h2`).
- **Body** (Geist, 400, 16px, 1.5): contenido operativo; mantener medidas de lectura moderadas.
- **Label** (Geist, 500–600, 12–14px): filtros, navegación, badges y metadatos.

## Layout

La app usa una capa de bruma muy ligera sobre el fondo y conserva un contenedor fluido para las vistas densas. El encabezado permanece fijo y compacto para que la navegación esté disponible en cronogramas largos. En móvil, reducir el relleno exterior de 24px a 16px, preservar objetivos de toque y permitir que la marca textual se oculte antes que los controles de trabajo.

## Elevation & Depth

La profundidad es ambiental y escasa: bordes tenues de espuma separan superficies; las sombras azules suaves aparecen en encabezado, diálogos, menú de notificaciones y acción primaria. Nunca combinar en una misma tarjeta un borde fuerte y una sombra amplia.

### Shadow Vocabulary

- **Elevación de navegación** (`0 10px 28px rgba(7, 59, 76, 0.06)`): encabezado fijo.
- **Elevación flotante** (`0 12px 32px rgba(7, 59, 76, 0.13)`): inicio de sesión, diálogos y elementos sobre el flujo.

## Shapes

Las superficies usan esquinas de 8–16px. Los chips y avatares pueden ser completamente redondos; los paneles no. La marca es una forma compacta, ligeramente asimétrica, con una onda geométrica interna: es el único gesto expresivo del sistema. El login añade un segundo gesto, exclusivo de esa pantalla: dos siluetas de oleaje en baja opacidad ancladas al pie del viewport (SVG, `currentColor` en marea/océano) — un nod a la costa sin volverse una postal.

## Components

### Buttons

- **Shape:** radio de 8px; peso 600 para el botón principal.
- **Primary:** océano profundo, texto blanco, sombra breve; hover hacia marea turquesa.
- **Secondary:** bruma/espuma con tinta marina; no competir visualmente con la acción principal.
- **Focus:** aro turquesa semitransparente de 3px con 2px de separación (aro cálido de arena dentro del encabezado, por contraste sobre fondo oscuro).
- **Tacto:** toda la app comparte una micro-interacción global (CSS, no por botón): leve aumento de brillo al pasar el cursor sobre un botón con fondo propio, y un pixel de presión al hacer clic.

### Chips

- **Style:** compactos, radio de 8px, tipografía de 11–12px y color solo cuando expresa estado o filtro.
- **State:** la familia cromática debe ser la misma en tarjetas, Gantt, calendario, agenda, notificaciones y Chontatec.

### Cards / Containers

- **Corner Style:** 12–16px para superficies principales; 8px en formularios y controles.
- **Background:** blanco sobre bruma o espuma muy sutil.
- **Border:** `#d0dfdc` en baja presencia.
- **Internal Padding:** 16px en controles y 24px en paneles principales, cuando el espacio lo permita.

### Inputs / Fields

- **Style:** fondo de bruma translúcida, borde de espuma y texto tinta marina.
- **Focus:** borde marea turquesa y aro de foco global; nunca ocultar el estado de teclado.

### Navigation

El header es el único bloque de color comprometido del sistema: degradado de océano profundo a marea turquesa (`.pacific-header`), con una línea de marea de 2px (arena→turquesa→arena) como horizonte al pie. Todo su texto e íconos pasan a bruma/blanco por contraste; los links van sobrios por defecto y a arena de sol al pasar el cursor. La marca cambia de escuadra océano-profundo (fondo claro) a escuadra arena-de-sol (fondo oscuro del header) para no desaparecer contra su propio fondo. La marca lleva al panorama de proyectos y no reemplaza ninguna acción existente.

**Nota de implementación:** cualquier panel de fondo claro que cuelgue del header en el DOM aunque flote visualmente sobre la página (ej. el desplegable de notificaciones) necesita la clase `pacific-popover` — si no, hereda el texto claro pensado para el océano oscuro y se vuelve illegible sobre su propio fondo blanco (bug real, ya corregido una vez).

### Chontatec

El asistente mantiene su personalidad visual propia a través de su avatar. El contenedor debe sentirse integrado al sistema con superficies de bruma, sombras marinas y tipografía legible, sin recolorear el personaje ni alterar la semántica de confirmaciones destructivas.

## Do's and Don'ts

### Do:

- **Do** conservar los colores de alerta por familia y priorizar contraste de texto.
- **Do** usar azul profundo para la acción más importante de cada contexto.
- **Do** dejar que los datos, fechas y responsables definan la jerarquía antes que los adornos.
- **Do** respetar `prefers-reduced-motion` y mantener indicadores de foco visibles.
- **Do** dejar el encabezado como el único bloque de color comprometido; el resto de la app se queda en la estrategia restringida (neutros + acento).

### Don't:

- **Don't** usar los colores regionales como arcoíris decorativo o aplicar patrones étnicos a tarjetas y tablas.
- **Don't** cambiar el rojo, ámbar, azul o verde de significado semántico.
- **Don't** usar gradientes de texto, glassmorphism ornamental o sombras duras.
- **Don't** modificar flujos, etiquetas funcionales ni comportamientos para justificar un cambio visual.
- **Don't** darle a un proyecto un color de fondo o de identidad propio — nombre + ícono ya alcanzan; ese camino se probó y se descartó.
- **Don't** usar los colores de identidad de persona (`Avatar.tsx`) para transmitir estado o alerta, ni viceversa.
