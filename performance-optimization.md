# Plano de Otimização de Performance - P1 Guest Hub

Esse arquivo acompanha a tarefa de resolver os travamentos e atrasos na digitação da recepção.

O plano de ação detalhado está documentado no artefato principal: [implementation_plan.md](file:///Users/cadu/.gemini/antigravity/brain/bb4539dc-10c3-44b2-8080-cfa384baf28f/implementation_plan.md).

## Resumo dos Passos

1. **Memoização global**: Evitar computações de filtros e sorts em arrays de milhares de hóspedes em todos os renders do React.
2. **Componente de Input Independente**: Extrair o textarea de envio de mensagens para isolar o estado de digitação (`newMessage`).
3. **Paginação de Renderização (Slice Rendering)**: Limitar a renderização de nós HTML na tela a grupos de 50 contatos de cada vez.
4. **Verificação**: Validar com linters e testar a digitação e salvamento de contatos.
