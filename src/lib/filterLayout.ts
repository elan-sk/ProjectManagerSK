// Barra de filtros compartida. Celular (< sm): dos columnas, «quitar filtros» flotando arriba a
// la derecha. Tablet (sm–lg): una sola fila con scroll horizontal, así se ven todos sin ocupar
// media pantalla (los desplegables van en portal para que la fila no los recorte). Escritorio:
// fila que se parte en varias si no entra.
export const FILTER_BAR =
  "relative grid grid-cols-2 items-start gap-3 max-sm:[&>[data-reset-filters]]:absolute max-sm:[&>[data-reset-filters]]:-top-3 max-sm:[&>[data-reset-filters]]:right-0 max-sm:[&>[data-reset-filters]]:z-10 max-sm:[&>[data-reset-filters]>span]:hidden max-sm:[&>*]:min-w-0 max-sm:[&>*:has(form)]:col-span-2 max-sm:[&_form]:w-full max-sm:[&_form_input]:w-full max-sm:[&>*>button:not(.relative)]:w-full max-sm:[&>*>button:not(.relative)]:text-left max-sm:[&>*>.relative>button]:w-full max-sm:[&>*>.relative>button]:text-left sm:flex sm:gap-x-5 sm:gap-y-3 sm:max-lg:flex-nowrap sm:max-lg:overflow-x-auto sm:max-lg:overflow-y-hidden sm:max-lg:pt-2 sm:max-lg:pb-1 sm:max-lg:[&>*]:shrink-0 sm:max-lg:[&>*]:whitespace-nowrap lg:flex-wrap";
