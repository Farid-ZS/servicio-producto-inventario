import { exigirPermiso } from '../autorizacion.js';
export class ConsultarAlertas {
  constructor({ alertas }) { this.alertas = alertas; }
  async ejecutar(_q, actor) { exigirPermiso(actor, 'inventory:history'); return this.alertas.listar(); }
}
