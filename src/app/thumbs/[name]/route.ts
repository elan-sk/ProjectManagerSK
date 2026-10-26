// Miniaturas: /thumbs/<archivo>?w=320|800. Mismo código que /uploads/<archivo>, pero en otra ruta:
// Next sirve directo desde public/ los archivos que ya estaban al arrancar e ignora el ?w=,
// así que pedirlas por /uploads/ devolvía siempre el original pesado.
export { GET } from "../../uploads/[name]/route";
export const dynamic = "force-dynamic";
