// Supabase Edge Function (Deno) - Analise nutricional via Groq.
// Deploy: supabase functions deploy analyze-food (verify_jwt=true vem do config.toml)
// Secret necessaria: supabase secrets set GROQ_API_KEY=sk-...
// Enquanto nao publicada, o app cai no fallback direto (Diet.tsx).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.6-27b',
  'groq/compound-mini',
  'groq/compound',
];

const SYSTEM_PROMPT =
  "Voce e um nutricionista. Retorne SOMENTE um JSON com protein, carbs, fat, fiber, calories (numeros). Regras: 1) Sempre use valores de alimentos COZIDOS/prontos para consumo (TACO), nao crus/in natura; 2) Considere quantidades mencionadas; 3) Porcoes padrao: 1 pao frances = 50g (150kcal), 1 ovo = 50g (78kcal), 1 banana = 100g (96kcal), 1 xicara arroz = 130g (170kcal), 1 concha feijao = 150g (114kcal), 1 fatia pao de forma = 30g (80kcal); 4) Seja preciso e realista. Retorne APENAS o JSON.";

function extrairMacros(content: string) {
  let texto = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  texto = texto.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(texto);
  } catch {
    const startIdx = texto.indexOf('{');
    if (startIdx === -1) throw new Error('Resposta da IA nao contem JSON valido');

    let depth = 0;
    let endIdx = -1;
    for (let i = startIdx; i < texto.length; i++) {
      if (texto[i] === '{') depth++;
      else if (texto[i] === '}') {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }
    if (endIdx === -1) throw new Error('JSON da IA incompleto (chaves desbalanceadas)');
    parsed = JSON.parse(texto.slice(startIdx, endIdx + 1));
  }

  return {
    protein: Number(parsed.protein ?? parsed.proteinas) || 0,
    carbs: Number(parsed.carbs ?? parsed.carboidratos) || 0,
    fat: Number(parsed.fat ?? parsed.gorduras) || 0,
    fiber: Number(parsed.fiber ?? parsed.fibras) || 0,
    calories: Number(parsed.calories ?? parsed.calorias) || 0,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Metodo nao permitido', { status: 405, headers: CORS_HEADERS });
  }

  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey || apiKey === 'sua-anon-key-aqui') {
    return new Response(
      JSON.stringify({ error: 'GROQ_API_KEY nao configurada. Rode: supabase secrets set GROQ_API_KEY=sk-...' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  let descricao = '';
  try {
    const body = await req.json();
    descricao = String(body?.description ?? '').trim();
  } catch {
    return new Response(JSON.stringify({ error: 'Body JSON invalido' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  if (!descricao) {
    return new Response(JSON.stringify({ error: 'Campo description e obrigatorio' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  let lastError = '';

  for (const model of GROQ_MODELS) {
    try {
      const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Analise esta refeição e retorne o JSON nutricional: ${descricao}` },
          ],
        }),
      });

      if (!res.ok) {
        lastError = `modelo ${model} retornou ${res.status}: ${await res.text()}`;
        continue;
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      const macros = extrairMacros(content);

      return new Response(JSON.stringify({ macros }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return new Response(
    JSON.stringify({ error: `Nao foi possivel analisar com a Groq. ${lastError.slice(0, 200)}` }),
    { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
});