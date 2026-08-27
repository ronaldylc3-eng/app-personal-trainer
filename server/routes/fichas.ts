import { Router, Request, Response } from 'express';
import {
  getAllClients,
  searchClients,
  getFichasByCliente,
  getFichaAtiva,
  createFicha,
  updateFicha,
  deleteFicha,
  getPrescricoesByFicha,
  getPrescricoesByFichaAndDia,
  createPrescricao,
  updatePrescricao,
  deletePrescricao,
  createSessao,
  getSessaoAtiva,
  finalizarSessao,
  getSessoesByCliente,
  createSerieRealizada,
  getSeriesBySessao,
  getUltimasSeriesByPrescricao,
  getProgressoPrescricoesStats,
  getUserProfile,
} from '../db/database.js';

const router = Router();

// ========================
// Clientes
// ========================

router.get('/api/clients', (_req: Request, res: Response) => {
  try {
    const q = _req.query.q as string | undefined;
    const clients = q ? searchClients(q) : getAllClients();
    return res.json(clients);
  } catch (err) {
    console.error('GET /api/clients error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/clients/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const profile = getUserProfile(id);
    if (!profile) return res.status(404).json({ error: 'Client not found' });
    return res.json(profile);
  } catch (err) {
    console.error('GET /api/clients/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================
// Fichas de Treino
// ========================

router.get('/api/fichas/:clienteId', (req: Request, res: Response) => {
  try {
    const clienteId = Number(req.params.clienteId);
    if (isNaN(clienteId)) return res.status(400).json({ error: 'Invalid clienteId' });
    const fichas = getFichasByCliente(clienteId);
    const fichasComExercicios = fichas.map(f => ({
      ...f,
      exercicios: getPrescricoesByFicha(f.id),
    }));
    return res.json(fichasComExercicios);
  } catch (err) {
    console.error('GET /api/fichas/:clienteId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/fichas/:clienteId/ativa', (req: Request, res: Response) => {
  try {
    const clienteId = Number(req.params.clienteId);
    if (isNaN(clienteId)) return res.status(400).json({ error: 'Invalid clienteId' });
    const ficha = getFichaAtiva(clienteId);
    if (!ficha) return res.status(404).json({ error: 'No active ficha found' });
    const exercicios = getPrescricoesByFicha(ficha.id);
    return res.json({ ...ficha, exercicios });
  } catch (err) {
    console.error('GET /api/fichas/:clienteId/ativa error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/fichas', (req: Request, res: Response) => {
  try {
    const { id_cliente, nome_ficha } = req.body;
    if (!id_cliente || !nome_ficha) {
      return res.status(400).json({ error: 'Missing required fields: id_cliente, nome_ficha' });
    }
    const ficha = createFicha({ id_cliente, nome_ficha });
    return res.status(201).json(ficha);
  } catch (err) {
    console.error('POST /api/fichas error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/fichas/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const { nome_ficha, ativa } = req.body;
    const data: Record<string, unknown> = {};
    if (nome_ficha !== undefined) data.nome_ficha = nome_ficha;
    if (ativa !== undefined) data.ativa = ativa;
    const ficha = updateFicha(id, data);
    if (!ficha) return res.status(404).json({ error: 'Ficha not found' });
    return res.json(ficha);
  } catch (err) {
    console.error('PUT /api/fichas/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/fichas/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    deleteFicha(id);
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/fichas/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================
// Prescricoes de Exercicios
// ========================

router.get('/api/prescricoes/:fichaId', (req: Request, res: Response) => {
  try {
    const fichaId = Number(req.params.fichaId);
    if (isNaN(fichaId)) return res.status(400).json({ error: 'Invalid fichaId' });
    const dia = req.query.dia as string | undefined;
    const exercicios = dia !== undefined
      ? getPrescricoesByFichaAndDia(fichaId, Number(dia))
      : getPrescricoesByFicha(fichaId);
    return res.json(exercicios);
  } catch (err) {
    console.error('GET /api/prescricoes/:fichaId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/prescricoes', (req: Request, res: Response) => {
  try {
    const { id_ficha, nome_exercicio, muscle_group, dia_semana, series, reps, descanso_segundos, carga_sugerida, ordem, id_exercicio } = req.body;
    if (!id_ficha || !nome_exercicio || !muscle_group || dia_semana === undefined) {
      return res.status(400).json({ error: 'Missing required fields: id_ficha, nome_exercicio, muscle_group, dia_semana' });
    }
    const prescricao = createPrescricao({
      id_ficha, nome_exercicio, muscle_group, dia_semana,
      series: series ?? 3, reps: reps ?? '10',
      descanso_segundos: descanso_segundos ?? 90,
      carga_sugerida: carga_sugerida ?? 0, ordem: ordem ?? 0,
      id_exercicio: id_exercicio ?? null,
    });
    return res.status(201).json(prescricao);
  } catch (err) {
    console.error('POST /api/prescricoes error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/prescricoes/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const { nome_exercicio, muscle_group, series, reps, descanso_segundos, carga_sugerida, ordem } = req.body;
    const data: Record<string, unknown> = {};
    if (nome_exercicio !== undefined) data.nome_exercicio = nome_exercicio;
    if (muscle_group !== undefined) data.muscle_group = muscle_group;
    if (series !== undefined) data.series = series;
    if (reps !== undefined) data.reps = reps;
    if (descanso_segundos !== undefined) data.descanso_segundos = descanso_segundos;
    if (carga_sugerida !== undefined) data.carga_sugerida = carga_sugerida;
    if (ordem !== undefined) data.ordem = ordem;
    const prescricao = updatePrescricao(id, data);
    if (!prescricao) return res.status(404).json({ error: 'Prescricao not found' });
    return res.json(prescricao);
  } catch (err) {
    console.error('PUT /api/prescricoes/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/prescricoes/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    deletePrescricao(id);
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/prescricoes/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================
// Sessoes Realizadas
// ========================

router.get('/api/sessoes/:clienteId/ativa', (req: Request, res: Response) => {
  try {
    const clienteId = Number(req.params.clienteId);
    if (isNaN(clienteId)) return res.status(400).json({ error: 'Invalid clienteId' });
    const sessao = getSessaoAtiva(clienteId);
    if (!sessao) return res.status(404).json({ error: 'No active session' });
    const series = getSeriesBySessao(sessao.id);
    return res.json({ ...sessao, series });
  } catch (err) {
    console.error('GET /api/sessoes/:clienteId/ativa error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/sessoes', (req: Request, res: Response) => {
  try {
    const { id_cliente, id_ficha, dia_semana } = req.body;
    if (!id_cliente) return res.status(400).json({ error: 'Missing required field: id_cliente' });
    const sessao = createSessao({ id_cliente, id_ficha: id_ficha ?? null, dia_semana: dia_semana ?? null });
    return res.status(201).json(sessao);
  } catch (err) {
    console.error('POST /api/sessoes error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/sessoes/:id/finalizar', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const sessao = finalizarSessao(id);
    if (!sessao) return res.status(404).json({ error: 'Session not found' });
    return res.json(sessao);
  } catch (err) {
    console.error('PUT /api/sessoes/:id/finalizar error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/sessoes/:clienteId/historico', (req: Request, res: Response) => {
  try {
    const clienteId = Number(req.params.clienteId);
    if (isNaN(clienteId)) return res.status(400).json({ error: 'Invalid clienteId' });
    const limit = Number(req.query.limit) || 10;
    const sessoes = getSessoesByCliente(clienteId, limit);
    return res.json(sessoes);
  } catch (err) {
    console.error('GET /api/sessoes/:clienteId/historico error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================
// Series Realizadas
// ========================

router.post('/api/series-realizadas', (req: Request, res: Response) => {
  try {
    const { id_sessao, id_prescricao, num_serie, carga_kg, reps_feitas, descanso_previsto_seg } = req.body;
    if (!id_sessao || num_serie === undefined) {
      return res.status(400).json({ error: 'Missing required fields: id_sessao, num_serie' });
    }
    const serie = createSerieRealizada({
      id_sessao, id_prescricao: id_prescricao ?? null, num_serie,
      carga_kg: carga_kg ?? 0, reps_feitas: reps_feitas ?? 0,
      descanso_previsto_seg: descanso_previsto_seg ?? 90,
    });
    return res.status(201).json(serie);
  } catch (err) {
    console.error('POST /api/series-realizadas error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/series-realizadas/sessao/:sessaoId', (req: Request, res: Response) => {
  try {
    const sessaoId = Number(req.params.sessaoId);
    if (isNaN(sessaoId)) return res.status(400).json({ error: 'Invalid sessaoId' });
    const series = getSeriesBySessao(sessaoId);
    return res.json(series);
  } catch (err) {
    console.error('GET /api/series-realizadas/sessao/:sessaoId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/series-realizadas/ultimas/:idPrescricao', (req: Request, res: Response) => {
  try {
    const idPrescricao = Number(req.params.idPrescricao);
    if (isNaN(idPrescricao)) return res.status(400).json({ error: 'Invalid idPrescricao' });
    const series = getUltimasSeriesByPrescricao(idPrescricao);
    return res.json(series);
  } catch (err) {
    console.error('GET /api/series-realizadas/ultimas/:idPrescricao error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================
// Progresso Prescricoes
// ========================

router.get('/api/progresso-prescricoes/:clienteId', (req: Request, res: Response) => {
  try {
    const clienteId = Number(req.params.clienteId);
    if (isNaN(clienteId)) return res.status(400).json({ error: 'Invalid clienteId' });
    const weekDate = req.query.weekDate as string | undefined;
    const stats = getProgressoPrescricoesStats(clienteId, weekDate);
    return res.json(stats);
  } catch (err) {
    console.error('GET /api/progresso-prescricoes/:clienteId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
