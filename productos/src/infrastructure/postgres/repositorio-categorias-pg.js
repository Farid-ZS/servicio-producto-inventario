import { Categoria } from '../../domain/categoria.js';

const mapear = (r) => Categoria.desde({ id: r.id, nombre: r.nombre, descripcion: r.descripcion, estado: r.estado, categoriaPadreId: r.categoria_padre_id });

export class RepositorioCategoriasPg {
  constructor(pool) { this.pool = pool; }
  async crear(c) {
    await this.pool.query('INSERT INTO categorias (id, nombre, descripcion, estado, categoria_padre_id) VALUES ($1,$2,$3,$4,$5)',
      [c.id, c.nombre, c.descripcion, c.estado, c.categoriaPadreId]);
  }
  async actualizar(c) {
    await this.pool.query('UPDATE categorias SET nombre=$2, descripcion=$3, estado=$4, categoria_padre_id=$5 WHERE id=$1',
      [c.id, c.nombre, c.descripcion, c.estado, c.categoriaPadreId]);
  }
  async porId(id) {
    const { rows } = await this.pool.query('SELECT * FROM categorias WHERE id=$1', [id]);
    return rows[0] ? mapear(rows[0]) : null;
  }
  async listar() {
    const { rows } = await this.pool.query('SELECT * FROM categorias ORDER BY nombre, id');
    return rows.map(mapear);
  }
  /** ADR-004: lista de adyacencia + WITH RECURSIVE. Devuelve ids de todos los descendientes. */
  async descendientes(id) {
    const { rows } = await this.pool.query(
      `WITH RECURSIVE arbol AS (
         SELECT id FROM categorias WHERE categoria_padre_id = $1
         UNION
         SELECT c.id FROM categorias c JOIN arbol a ON c.categoria_padre_id = a.id
       ) SELECT id FROM arbol`, [id]);
    return rows.map((r) => r.id);
  }
}
