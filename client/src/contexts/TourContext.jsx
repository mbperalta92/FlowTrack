import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { Joyride, STATUS } from 'react-joyride';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

const TourContext = createContext(null);

export function TourProvider({ children }) {
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const { user, isKeyUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Role check: privileged role if admin, both, key_user, or Mauricio Peralta
  const isPrivilegedRole = useMemo(() => {
    if (!user) return false;
    const role = user.role;
    return role === 'admin' || role === 'both' || role === 'key_user' || isKeyUser;
  }, [user, isKeyUser]);

  // Construct steps list dynamically based on user role
  const allPotentialSteps = useMemo(() => {
    return [
      // 1. Apresentação Geral / Header Brand
      {
        target: '[data-tour="header-brand"]',
        title: '🌟 Bem-vindo ao REPFIX FlowTrack',
        content: 'Esta é a plataforma centralizada de gestão de processos, peritagens e agendamentos. Clique em "Seguinte" para um guia passo-a-passo pelas abas e campos!',
        skipBeacon: true,
        placement: 'bottom',
        page: '/processos'
      },
      // 2. Menu Principal & Abas
      {
        target: '[data-tour="header-nav"]',
        title: '🧭 Menu Principal & Abas de Navegação',
        content: 'Navegue facilmente entre as áreas do sistema:\n\n' +
                 '• 📋 Processos: Lista de tickets, peritagens e workflow em Kanban.\n' +
                 '• 📅 Calendário: Agenda global de intervenções e agendamentos.\n' +
                 (isPrivilegedRole ? '• 👥 Utilizadores: Gestão da equipa e papéis.\n' +
                 '• 📈 Análise: Métricas de desempenho e gráficos de produtividade.' : ''),
        skipBeacon: true,
        placement: 'bottom',
        page: '/processos'
      },
      // 3. Central de Notificações
      {
        target: '[data-tour="notifications-btn"]',
        title: '🔔 Central de Notificações',
        content: 'Receba avisos automáticos em tempo real sempre que um processo lhe for atribuído ou quando um processo avançar de fase (ex: SUPERVISÃO ou ELABORAÇÃO).',
        skipBeacon: true,
        placement: 'bottom',
        page: '/processos'
      },
      // 4. Perfil de Utilizador
      {
        target: '[data-tour="user-profile"]',
        title: '👤 Perfil & Conta',
        content: 'Verifique o seu nome de utilizador, papel de acesso (Perito, Gestor ou Key User) e termine a sessão em segurança.',
        skipBeacon: true,
        placement: 'bottom',
        page: '/processos'
      },
      // 5. Painel de KPIs Rápidos
      {
        target: '[data-tour="kpis-panel"]',
        title: '📊 Painel de KPIs e Métricas em Tempo Real',
        content: 'Monitorize os principais indicadores:\n\n' +
                 '• 📂 Processos Abertos: Total de trabalhos ativos.\n' +
                 '• ✍️ Em Elaboração: Relatórios de peritagem em redação.\n' +
                 '• 👁️ Em Supervisão: Processos pendentes de revisão final.\n' +
                 '• ⚠️ Intervenções Atrasadas: Trabalhos com data limite ultrapassada.\n' +
                 '• ✅ Processos Fechados: Histórico concluído.\n\n' +
                 '💡 Dica: Clicar num card de KPI filtra a lista instantaneamente!',
        skipBeacon: true,
        placement: 'bottom',
        page: '/processos'
      },
      // 6. Botão Novo Processo & Explicação dos Campos (Condicional)
      ...(isPrivilegedRole ? [{
        target: '[data-tour="new-process-btn"]',
        title: '➕ Registar Processo — Explicação dos Campos',
        content: 'Abre o formulário de registo com os seguintes campos:\n\n' +
                 '• Tipo: PROC (Principal), ADT (Aditamento) ou ESC (Escalonamento urgente).\n' +
                 '• Processo Pai: Associação obrigatória para aditamentos (ADT) ou escalonamentos (ESC).\n' +
                 '• Cliente & Código: Identificação da entidade e referência do cliente.\n' +
                 '• Morada / Local: Endereço completo da peritagem.\n' +
                 '• Descrição: Instruções e escopo dos trabalhos.\n' +
                 '• Prioridade: Baixa, Média ou Alta.\n' +
                 '• Agendamento & Intervenção: Marcação de datas de campo.\n' +
                 '• Gestor & Técnico: Atribuição de responsáveis administrativos e peritos.',
        skipBeacon: true,
        placement: 'bottom',
        page: '/processos'
      }] : []),
      // 7. Modos de Visualização (Tabela vs Kanban)
      {
        target: '[data-tour="view-toggle"]',
        title: '🔄 Alternar Vistas (Tabela / Kanban)',
        content: 'Alterne a forma de visualização dos processos:\n\n' +
                 '• 📋 Tabela: Vista em lista com ordenação avançada por colunas.\n' +
                 '• 🗂️ Kanban: Vista em cartões dividida pelas 6 fases operacionais.',
        skipBeacon: true,
        placement: 'bottom',
        page: '/processos'
      },
      // 8. Botão Meus Processos
      {
        target: '[data-tour="my-processes-btn"]',
        title: '👤 Filtro "Meus Processos"',
        content: 'Filtra os processos para apresentar unicamente os trabalhos atribuídos ao seu utilizador.',
        skipBeacon: true,
        placement: 'bottom',
        page: '/processos'
      },
      // 9. Exportar & Importar Excel (Condicional)
      ...(isPrivilegedRole ? [{
        target: '[data-tour="export-import-actions"]',
        title: '📤 Importação e Exportação Excel',
        content: '• 📤 Exportar Lista: Descarrega os processos filtrados num ficheiro Excel (.xlsx).\n' +
                 '• 📥 Importar Excel: Carregamento em lote de múltiplos processos via folha de cálculo.',
        skipBeacon: true,
        placement: 'bottom',
        page: '/processos'
      }] : []),
      // 10. Barra de Pesquisa e Filtros
      {
        target: '[data-tour="filters-bar"]',
        title: '🔍 Barra de Pesquisa e Filtros Avançados',
        content: 'Combine critérios para encontrar qualquer processo:\n\n' +
                 '• Pesquisa por Texto: Cliente, ID de Processo (ex: PROC-001) ou Código.\n' +
                 '• Filtros de Estado & Milestone: Selecione fases (FILA, AGENDADO, PENDENTE, ELABORAÇÃO, ANÁLISE, SUPERVISÃO).\n' +
                 '• Filtros por Técnico ou Gestor.\n' +
                 '• 🔄 Limpar: Limpa todos os filtros num único clique.',
        skipBeacon: true,
        placement: 'bottom',
        page: '/processos'
      },
      // 11. Workflow Kanban & Fases
      {
        target: '[data-tour="kanban-board"]',
        title: '🗂️ Workflow Operacional (6 Fases)',
        content: 'Progressão contínua de um processo:\n\n' +
                 '1️⃣ FILA: Processo criado, a aguardar atribuição/agendamento.\n' +
                 '2️⃣ AGENDADO: Visita de campo marcada com data e hora.\n' +
                 '3️⃣ PENDENTE: A aguardar dados ou elementos de terceiros.\n' +
                 '4️⃣ ELABORAÇÃO: Peritagem concluída; relatório a ser escrito.\n' +
                 '5️⃣ ANÁLISE: Validação técnica do relatório.\n' +
                 '6️⃣ SUPERVISÃO: Revisão final e encerramento pela gestão.\n\n' +
                 '✋ Arraste e largue os cartões para mover processos entre fases!',
        skipBeacon: true,
        placement: 'top',
        page: '/processos'
      },
      // 12. Transição para o Calendário
      {
        target: '[data-tour="calendar-link"]',
        title: '📅 Aba de Calendário & Agendamento',
        content: 'Clique em "Seguinte" para consultar a aba de Calendário Global.',
        skipBeacon: true,
        placement: 'bottom',
        page: '/processos'
      },
      // 13. Vista do Calendário Global
      {
        target: '[data-tour="calendar-header"]',
        title: '📅 Navegação & Vistas do Calendário',
        content: 'Consulte agendamentos e peritagens por Mês, Semana, Dia ou na vista em Agenda. Navegue rapidamente pelos meses e semanas com os botões < e >.',
        skipBeacon: true,
        placement: 'bottom',
        page: '/calendario'
      },
      // 14. Filtros no Calendário
      {
        target: '[data-tour="calendar-filters"]',
        title: '🎯 Filtros por Perito ou Gestor no Calendário',
        content: 'Filtre os eventos do calendário para visualizar apenas a agenda de um Técnico ou Gestor específico.',
        skipBeacon: true,
        placement: 'bottom',
        page: '/calendario'
      },
      // 15. Grelha de Eventos e Atalho Rápido
      {
        target: '[data-tour="calendar-view"]',
        title: '⚡ Intervenções & Atalhos no Calendário',
        content: 'Os eventos surgem com códigos de cor consoante o tipo e a urgência.\n\n' +
                 '💡 Dica de Produtividade: Dê um duplo clique num agendamento para abrir a janela com os detalhes e o histórico do processo!',
        skipBeacon: true,
        placement: 'top',
        page: '/calendario'
      },
      // 16. Aba Utilizadores (Condicional)
      ...(isPrivilegedRole ? [{
        target: '[data-tour="users-nav-link"]',
        title: '👥 Aba de Utilizadores (Gestão de Contas)',
        content: 'Permite gerir a equipa e atribuir privilégios:\n\n' +
                 '• Key User: Controlo total do sistema.\n' +
                 '• Administrador/Gestor: Gestão de processos e relatórios.\n' +
                 '• Perito/Técnico: Execução de peritagens de campo.\n' +
                 '• Ambos: Perfil combinado de Gestor + Perito.',
        skipBeacon: true,
        placement: 'bottom',
        page: '/calendario'
      }] : []),
      // 17. Aba Análise (Condicional)
      ...(isPrivilegedRole ? [{
        target: '[data-tour="analytics-nav-link"]',
        title: '📈 Aba de Análise (Dashboard de Métricas)',
        content: 'Painel completo de inteligência operacional com gráficos de distribuição por fase, tempos médios de resposta e carga de trabalho por técnico.',
        skipBeacon: true,
        placement: 'bottom',
        page: '/calendario'
      }] : [])
    ];
  }, [isPrivilegedRole]);

  // Active steps after DOM fail-safe filtering
  const [activeSteps, setActiveSteps] = useState(allPotentialSteps);

  const startTour = useCallback(() => {
    // If not on /processos, navigate there first
    if (location.pathname !== '/processos') {
      navigate('/processos');
    }
    
    // Fail-safe DOM check: Filter out steps whose target elements do not exist in DOM for current page
    setTimeout(() => {
      const validSteps = allPotentialSteps.filter(step => {
        if (step.page === '/processos') {
          const el = document.querySelector(step.target);
          return el !== null;
        }
        return true;
      });

      setActiveSteps(validSteps);
      setStepIndex(0);
      setRun(false);
      setTimeout(() => {
        setRun(true);
      }, 100);
    }, 150);
  }, [location.pathname, navigate, allPotentialSteps]);

  // Auto-start guided tour on first visit for each user
  useEffect(() => {
    if (!user || !user.id || location.pathname !== '/processos') return;
    const storageKey = `flowtrack_tour_completed_${user.id}`;
    const alreadyCompleted = localStorage.getItem(storageKey);

    if (!alreadyCompleted) {
      const timer = setTimeout(() => {
        localStorage.setItem(storageKey, 'true');
        startTour();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [user, location.pathname, startTour]);

  const handleJoyrideCallback = (data) => {
    const { status, type, index, action } = data;
    const finishedStatuses = [STATUS.FINISHED, STATUS.SKIPPED];

    // Target not found fail-safe error handling
    if (type === 'error:target_not_found' || type === 'error') {
      console.warn(`[Tour] Target not found for step index ${index}:`, data.step?.target);
      const nextIdx = index + 1;
      if (nextIdx < activeSteps.length) {
        setStepIndex(nextIdx);
      } else {
        setRun(false);
      }
      return;
    }

    if (finishedStatuses.includes(status)) {
      if (user?.id) {
        localStorage.setItem(`flowtrack_tour_completed_${user.id}`, 'true');
      }
      setRun(false);
    } else if (type === 'step:after') {
      const nextIndex = index + (action === 'prev' ? -1 : 1);
      
      if (nextIndex < 0 || nextIndex >= activeSteps.length) {
        setRun(false);
        return;
      }

      const nextStep = activeSteps[nextIndex];
      if (nextStep) {
        // Cross-page navigation based on next step target page
        if (nextStep.page === '/calendario' && location.pathname !== '/calendario') {
          navigate('/calendario');
        } else if (nextStep.page === '/processos' && location.pathname !== '/processos') {
          navigate('/processos');
        } else if (nextStep.page === '/utilizadores' && location.pathname !== '/utilizadores') {
          navigate('/utilizadores');
        } else if (nextStep.page === '/analise' && location.pathname !== '/analise') {
          navigate('/analise');
        }
      }

      setStepIndex(nextIndex);
    }
  };

  return (
    <TourContext.Provider value={{ startTour, run }}>
      {children}
      <Joyride
        steps={activeSteps}
        run={run}
        stepIndex={stepIndex}
        continuous={true}
        showSkipButton={true}
        showProgress={true}
        scrollToFirstStep={true}
        onEvent={handleJoyrideCallback}
        options={{
          arrowColor: '#1a2235',
          backgroundColor: '#1a2235',
          overlayColor: 'rgba(5, 10, 22, 0.8)',
          primaryColor: '#eab308',
          textColor: '#f8fafc',
          width: 360,
          zIndex: 10000,
          skipBeacon: true
        }}
        styles={{
          tooltip: {
            borderRadius: '14px',
            padding: '20px 22px',
            boxShadow: '0 20px 30px -5px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1)',
            border: '1px solid #2d3b55',
            backgroundColor: '#1a2235'
          },
          tooltipContainer: {
            textAlign: 'left'
          },
          tooltipTitle: {
            color: '#facc15',
            fontSize: '18px',
            fontWeight: '700',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          },
          tooltipContent: {
            color: '#cbd5e1',
            fontSize: '14px',
            lineHeight: '1.6',
            marginBottom: '16px'
          },
          buttonNext: {
            backgroundColor: '#eab308',
            color: '#0f172a',
            fontWeight: '700',
            fontSize: '13px',
            borderRadius: '8px',
            padding: '8px 18px',
            outline: 'none',
            border: 'none',
            boxShadow: '0 2px 8px rgba(234, 179, 8, 0.3)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          },
          buttonBack: {
            color: '#94a3b8',
            fontSize: '13px',
            fontWeight: '600',
            marginRight: '10px',
            cursor: 'pointer'
          },
          buttonSkip: {
            color: '#64748b',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer'
          }
        }}
        locale={{
          back: 'Anterior',
          close: 'Fechar',
          last: 'Concluir',
          next: 'Seguinte',
          skip: 'Saltar'
        }}
      />
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour deve ser usado dentro de um TourProvider');
  }
  return context;
}
