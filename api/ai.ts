// Módulo de IA removido — rota mantida apenas para compatibilidade.
// Qualquer chamada a /api/ai agora retorna 410 (Gone).
export default async function handler(_req: any, res: any) {
  return res.status(410).json({
    error: 'Assistente de IA removido deste build. Use as funcionalidades determinísticas do Atlas.',
    code: 'AI_REMOVED',
  })
}
