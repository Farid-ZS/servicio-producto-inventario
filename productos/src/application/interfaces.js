// Contratos de la arquitectura hexagonal. Se verifican en la raíz de composición (main.js) y en los tests.
export const SERVICIOS_APLICACION = {
  GestionarCategorias: ['crear', 'modificar', 'desactivar', 'activar', 'listar'],
  RegistrarProducto: ['ejecutar'],
  ModificarProducto: ['ejecutar'],
  CambiarEstadoProducto: ['activar', 'desactivar'],
  ConsultarCatalogo: ['detalle', 'buscar'],
};
export const INTERFACES_INFRA = {
  RepositorioProductos: ['crear', 'actualizar', 'porId', 'buscar', 'listarActivosPorCategorias'],
  RepositorioCategorias: ['crear', 'actualizar', 'porId', 'listar', 'descendientes'],
  ServicioDisponibilidad: ['consultarPorLote'],
};
export function verificarInterfaz(catalogo, nombre, impl) {
  const faltan = (catalogo[nombre] ?? []).filter((m) => typeof impl[m] !== 'function');
  if (faltan.length) throw new Error(`${impl.constructor.name} no implementa la interfaz ${nombre}: faltan ${faltan.join(', ')}`);
  return impl;
}
