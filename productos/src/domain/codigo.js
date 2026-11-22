import { randomBytes } from 'node:crypto';
/** Código comercial legible: PRD-XXXXXXXX. La unicidad la garantiza el UNIQUE de la BD (ADR-016). */
export const generarCodigoProducto = () => `PRD-${randomBytes(4).toString('hex').toUpperCase()}`;
