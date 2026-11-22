import amqp from 'amqplib';

/** Publicador AMQP con confirmaciones (publisher confirms). Exchange topic durable: products.integration.v1 */
export class RabbitPublicador {
  constructor({ url, exchange, log }) { Object.assign(this, { url, exchange, log }); }
  async conectar() {
    this.conn = await amqp.connect(this.url);
    this.conn.on('error', (error) => this.log.error({ error }, 'conexión RabbitMQ con error'));
    this.canal = await this.conn.createConfirmChannel();
    await this.canal.assertExchange(this.exchange, 'topic', { durable: true });
  }
  publicar(evento) {
    return new Promise((ok, fail) => this.canal.publish(
      this.exchange, evento.eventType, Buffer.from(JSON.stringify(evento)),
      { persistent: true, contentType: 'application/json', messageId: evento.eventId, type: evento.eventType },
      (err) => (err ? fail(err) : ok())));
  }
  async cerrar() { await this.canal?.close().catch(() => {}); await this.conn?.close().catch(() => {}); }
}
