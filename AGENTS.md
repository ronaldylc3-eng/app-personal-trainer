# Convenções do projeto (FitnessApp)

- Web dev: use `npm run dev` (servidor em http://localhost:3000; HMR na porta 3000).
- Validação de build: `npm run build` antes de concluir mudanças.
- NÃO executar `npx cap sync android` por conta própria.
  - Só rodar quando o usuário pedir explicitamente ("roda o cap sync").
  - O sync é necessário apenas antes de gerar/atualizar o APK no Android Studio.
- Typecheck: `npx tsc --noEmit`. Erros pré-existentes em Diet.tsx, Inicio/ModalPlanejamentoAluno.tsx,
  Sidebar.tsx e Workouts/* não são escopo destas tarefas.
- Compartilhamento de treino ("Story 📸") fica em WorkoutStoryModal.tsx
  (share nativo via @capacitor/share + filesystem; botões secundários "Baixar PNG HD" e
  "Copiar Imagem (Ctrl+V)").