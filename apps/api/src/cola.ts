import { Injectable, OnModuleDestroy, OnModuleInit, Inject } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Configuracion } from './config';
import { BaseDatos } from './base-datos';
import { ServicioEntradas } from './entradas';

@Injectable()
export class ColaWhatsapp implements OnModuleInit, OnModuleDestroy {
  private readonly conexion: IORedis;
  private readonly queue: Queue;
  private worker?: Worker;
  constructor(@Inject('CONFIG') private readonly config: Configuracion, private readonly db: BaseDatos, private readonly entradas: ServicioEntradas) {
    this.conexion = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue('whatsapp-entrante', { connection: this.conexion });
  }
  async onModuleInit() {
    this.worker = new Worker('whatsapp-entrante', async job => this.entradas.procesar(job.data.idExterno as string), { connection: this.conexion.duplicate(), concurrency: 8 });
    this.worker.on('failed', (job, error) => console.error(JSON.stringify({ evento: 'trabajo_fallido', id: job?.id, error: error.message })));
    const pendientes = await this.db.eventoWhatsapp.findMany({ where: { estado: 'PENDIENTE' }, select: { identificadorExterno: true }, take: 1000 });
    for (const pendiente of pendientes) await this.encolar(pendiente.identificadorExterno);
  }
  async encolar(idExterno: string): Promise<void> {
    await this.queue.add('procesar', { idExterno }, { jobId: Buffer.from(idExterno).toString('hex'), attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: true, removeOnFail: false });
  }
  async salud(): Promise<boolean> { return (await this.conexion.ping()) === 'PONG'; }
  async onModuleDestroy() { await this.worker?.close(); await this.queue.close(); await this.conexion.quit(); }
}
