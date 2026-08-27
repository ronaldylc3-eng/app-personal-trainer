import { Router, Request, Response } from 'express';
import { createMeal } from '../db/database.js';

const router = Router();

const GROQ_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'];

async function callGroq(apiKey: string, systemPrompt: string, userMessage: string, model: string): Promise<any> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Groq HTTP error [${model}]:`, response.status, errorBody);
    throw new Error(`Groq HTTP ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  console.log(`Groq response [${model}]:`, JSON.stringify(data).slice(0, 500));
  return data;
}

router.post('/api/ai/analyze-food', async (req: Request, res: Response) => {
  try {
    const { userId, date, meal_label, food_description } = req.body;

    if (!userId || !date || !meal_label || !food_description) {
      return res.status(400).json({
        error: 'Campos obrigatórios: userId, date, meal_label, food_description',
      });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GROQ_API_KEY não configurada no servidor' });
    }

    const systemPrompt = `Você é um nutricionista. Analise a refeição e retorne valores nutricionais precisos em JSON, baseado na tabela TACO/USDA.

REGRAS:
1. Analise cada alimento separadamente e some os totais.
2. Porções padrão brasileiras: 200g arroz, 150g feijão, 100g carne/p/frango.
3. Frito = +14g óleo; grelhado/assado = sem óleo extra.
4. Para pratos compostos ("prato feito"), decomponha cada ingrediente.
5. Prefira ser conservador nos valores.

REFERÊNCIAS (por porção):
- Arroz branco cozido (200g): 260kcal, 56c, 5p, 0.5g, 0.8f
- Feijão carioca (150g): 170kcal, 30c, 9p, 0.7g, 8.4f
- Frango grelhado (100g): 165kcal, 0c, 31p, 3.6g
- Frango frito/panado (100g): 230kcal, 10c, 27p, 9g
- Carne bovina grelhada (100g): 250kcal, 0c, 26p, 15g
- Carne moída refogada (100g): 215kcal, 0c, 21p, 14g
- Ovo cozido (1 un): 70kcal, 0.5c, 6.5p, 5g
- Ovo frito (1 un): 90kcal, 0.5c, 6.5p, 7g
- Batata cozida (100g): 87kcal, 20c, 1.5p, 0.1g
- Batata frita (100g): 312kcal, 35c, 3.5p, 17g
- Macarrão cozido (100g): 110kcal, 22c, 3p, 0.5g
- Pão francês (1 un ~50g): 135kcal, 26c, 4p, 1.5g
- Leite integral (200ml): 120kcal, 9c, 6p, 7g
- Banana (1 un ~120g): 107kcal, 27c, 1.3p, 0.4g
- Maçã (1 un ~150g): 78kcal, 21c, 0.5p, 0.3g
- Muçarela (30g): 84kcal, 0.5c, 6.5p, 6.5g
- Requeijão (30g): 60kcal, 1.5c, 2p, 5.5g
- Whey protein (1 scoop ~30g): 120kcal, 3c, 24p, 1.5g
- Aveia (40g): 140kcal, 23c, 5p, 3g
- Castanha (30g): 195kcal, 3c, 4.5p, 19g
- Lasanha (1 porção ~250g): 350kcal, 35c, 18p, 16g
- Strogonoff frango (200g): 300kcal, 12c, 22p, 18g
- Peixe grelhado (100g): 120kcal, 0c, 24p, 2.5g
- Arroz integral (200g): 240kcal, 50c, 5.6p, 1.8g, 3.6f
- Feijão-preto (150g): 185kcal, 33c, 10p, 0.7g, 10.5f
- Mandioca (100g): 125kcal, 30c, 0.8p, 0.2g

Responda APENAS com JSON:
{"calories":0,"carbs":0,"protein":0,"fat":0,"fiber":0}
Números reais, 1 casa decimal.`;

    const userMessage = `Analise esta refeição e retorne o JSON com os valores nutricionais:\n\n${food_description}`;

    let content: string | null = null;

    for (const model of GROQ_MODELS) {
      try {
        console.log(`Trying model: ${model}`);
        const aiResponse = await callGroq(apiKey, systemPrompt, userMessage, model);
        const candidate = aiResponse.choices?.[0]?.message?.content;
        if (candidate) {
          content = candidate;
          console.log(`Success with model: ${model}`);
          break;
        }
        console.warn(`Empty content from ${model}, trying next...`);
      } catch (err: any) {
        console.warn(`Model ${model} failed:`, err?.message || err);
      }
    }

    if (!content) {
      console.error('All Groq models returned empty or failed');
      return res.status(502).json({ error: 'Groq retornou uma resposta vazia. Tente novamente.' });
    }

    let parsed: { calories: number; carbs: number; protein: number; fat: number; fiber: number };

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('No JSON in Groq response:', content);
        return res.status(502).json({ error: `A resposta do Groq não contém JSON válido: ${content.slice(0, 200)}` });
      }
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Falha ao parsear JSON do Groq:', parseError, 'Content:', content);
      return res.status(502).json({ error: 'Groq retornou dados mal formatados' });
    }

    if (
      typeof parsed.calories !== 'number' ||
      typeof parsed.carbs !== 'number' ||
      typeof parsed.protein !== 'number' ||
      typeof parsed.fat !== 'number' ||
      typeof parsed.fiber !== 'number'
    ) {
      console.error('Invalid parsed values:', parsed);
      return res.status(502).json({ error: 'Resposta do Groq com campos numéricos faltando' });
    }

    const meal = createMeal(userId, {
      date,
      meal_label,
      food_description,
      calories: parsed.calories,
      carbs: parsed.carbs,
      protein: parsed.protein,
      fat: parsed.fat,
      fiber: parsed.fiber,
      ai_raw_response: content,
    });

    return res.status(201).json(meal);
  } catch (err) {
    console.error('POST /api/ai/analyze-food error:', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;
