import { pool } from "../compartilhado/db.js";

export async function reserveDailyRun(date) {
  return pool.query(`
    INSERT INTO notificacoes_processadas (data) VALUES ($1::date)
    ON CONFLICT (data) DO NOTHING
    RETURNING data
  `, [date]);
}

export async function findAppointmentsForNotification(date) {
  return pool.query(`
    SELECT a.id AS agendamento_id, c.id AS cliente_id,
           c.receber_notificacoes, c.canal, b.id AS barbeiro_id
    FROM agendamentos a
    JOIN clientes c ON c.id = a.cliente_id
    JOIN barbeiros b ON b.id = a.barbeiro_id
    WHERE a.data = $1::date AND a.situacao = 'AGENDADO'
    ORDER BY a.horario
  `, [date]);
}
