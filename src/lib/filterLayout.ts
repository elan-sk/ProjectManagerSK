// Barra de filtros compartida. Celular (< sm): dos columnas detrás del botón «Filtros»,
// «quitar filtros» flotando arriba a la derecha. De sm en adelante (tablet y escritorio):
// siempre una sola fila; si no entra, scroll horizontal (los desplegables van en portal para
// que la fila no los recorte).
export const FILTER_BAR =
  "relative grid grid-cols-2 items-start gap-3 max-sm:[&>[data-reset-filters]]:absolute max-sm:[&>[data-reset-filters]]:-top-3 max-sm:[&>[data-reset-filters]]:right-0 max-sm:[&>[data-reset-filters]]:z-10 max-sm:[&>[data-reset-filters]>span]:hidden max-sm:[&>*]:min-w-0 max-sm:[&>*:has(form)]:col-span-2 max-sm:[&_form]:w-full max-sm:[&_form_input]:w-full max-sm:[&>*>button:not(.relative)]:w-full max-sm:[&>*>button:not(.relative)]:text-left max-sm:[&>*>.relative>button]:w-full max-sm:[&>*>.relative>button]:text-left sm:flex sm:min-w-0 sm:flex-nowrap sm:gap-x-5 sm:overflow-x-auto sm:overflow-y-hidden sm:pt-2 sm:pb-1 sm:[&>*]:shrink-0 sm:[&>*]:whitespace-nowrap";
