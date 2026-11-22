import amqp from 'amqplib';

/**
 * Adaptador de ENTRADA por eventos (RabbitMQ): consume products.integration.v1 e invoca el puerto SincronizarCicloVidaProducto.
 * Topología: main queue -> (fallo reintentable) -> retry queue con TTL -> vuelve a main; agotados los intentos -> DLQ (ADR-024/025).
 */
export class ConsumidorProductos {
  constructor({ url, sincronizar, log, maxIntentos = 5, retardoMs = 5000, exchange = 'products.integration.v1', cola = 'inventory.products.q' }) {
    Object.assign(this, { url, sincronizar, log, maxIntentos, retardoMs, exchange, cola });
  }

  async iniciar() {
    this.conn = await amqp.connect(this.url);
    this.ch = await this.conn.createChannel();
    const { ch, cola, exchange } = this;
    await ch.assertExchange(exchange, 'topic', { durable: true });
    await ch.assertQueue(`${cola}.dlq`, { durable: true });
    await ch.assertQueue(`${cola}.retry`, { durable: true, arguments: { 'x-message-ttl': this.retardoMs, 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': cola } });
    await ch.assertQueue(cola, { durable: true });
    await ch.bindQueue(cola, exchange, 'Producto*');
    await ch.prefetch(10);
    await ch.consume(cola, (msg) => msg && this.#procesar(msg));
  }

  async #procesar(msg) {
    const { ch } = this;
    try {
      const resultado = await this.sincronizar.ejecutar(JSON.parse(msg.content.toString()));
      this.log.info({ messageId: msg.properties.messageId, resultado }, 'evento de producto procesado');
      ch.ack(msg);
    } catch (error) {
      const intentos = (msg.properties.headers?.['x-intentos'] ?? 0) + 1;
      const reintentable = error.reintentable === true || !(error.code && error.statusCode); // no controlados/adelantados => reintento
      const opts = { persistent: true, headers: { ...msg.properties.headers, 'x-intentos': intentos, 'x-ultimo-error': String(error.message).slice(0, 200) } };
      if (reintentable && intentos < this.maxIntentos) ch.sendToQueue(`${this.cola}.retry`, msg.content, opts);
      else { this.log.error({ error, messageId: msg.properties.messageId, intentos }, 'evento a cola de fallidos'); ch.sendToQueue(`${this.cola}.dlq`, msg.content, opts); }
      ch.ack(msg);
    }
  }
  async cerrar() { await this.ch?.close().catch(() => {}); await this.conn?.close().catch(() => {}); }
}
