import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import ProcessDetailModal from '../components/ProcessDetailModal';
import InlineTimePicker from '../components/InlineTimePicker';
import api from '../services/api';
import toast from 'react-hot-toast';
import './CalendarPage.css';

export default function CalendarPage() {
  const { user, isAdmin } = useAuth();
  
  // Date State
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Data State
  const [events, setEvents] = useState([]);
  const [birthdays, setBirthdays] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Process Modal State
  const [selectedProcessId, setSelectedProcessId] = useState(null);
  
  // Selected Day Details State
  const [selectedDateStr, setSelectedDateStr] = useState(null);
  const [showDayDetails, setShowDayDetails] = useState(false);
  
  // View and Filter State
  const [viewMode, setViewMode] = useState('agenda'); // 'agenda', 'month', 'week', 'day'
  const [managerFilter, setManagerFilter] = useState('');
  const [technicianFilter, setTechnicianFilter] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  
  // Event Creation Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    event_date: '',
    event_time: '',
    participant_ids: []
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Month navigation helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  // Load data when year/month changes
  useEffect(() => {
    loadCalendarData();
  }, [year, month]);

  async function loadCalendarData() {
    setLoading(true);
    setError('');
    try {
      // Fetch events & birthdays for this month/year
      const eventRes = await api.get(`/events?month=${month + 1}&year=${year}`);
      setEvents(eventRes.events || []);
      setBirthdays(eventRes.birthdays || []);

      // Fetch processes (to display schedule_date and next_intervention_date)
      const procRes = await api.get('/processes');
      setProcesses(procRes || []);

      // Fetch all users for filters and participant list
      const usersRes = await api.get('/users');
      setAllUsers(usersRes || []);
      if (isAdmin) {
        setUsers(usersRes || []);
      }
    } catch (err) {
      toast.error(err.message || 'Erro ao carregar dados do calendário.');
    } finally {
      setLoading(false);
    }
  }

  // Generate calendar days
  const calendarDays = useMemo(() => {
    // First day of the month
    const firstDay = new Date(year, month, 1);
    // Day of the week of first day (0 = Sunday, 1 = Monday...)
    const startDayOfWeek = firstDay.getDay();
    
    // Number of days in current month
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const daysArray = [];
    
    // Fill empty cells for days from previous month
    for (let i = 0; i < startDayOfWeek; i++) {
      daysArray.push(null);
    }
    
    // Fill cells for current month
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      daysArray.push({
        day,
        dateStr,
        date: new Date(year, month, day)
      });
    }
    
    return daysArray;
  }, [year, month]);

  // Map events, birthdays, schedule dates, next intervention dates by date string
  const eventsByDate = useMemo(() => {
    const map = {};
    const filterUser1 = managerFilter ? parseInt(managerFilter, 10) : null;
    const filterUser2 = technicianFilter ? parseInt(technicianFilter, 10) : null;

    function itemPassesFilters(userIdsToCheck) {
      if (!filterUser1 && !filterUser2) return true;
      
      const involvedUserIds = Array.isArray(userIdsToCheck) ? userIdsToCheck : [userIdsToCheck];
      
      if (filterUser1 && !involvedUserIds.includes(filterUser1)) return false;
      if (filterUser2 && !involvedUserIds.includes(filterUser2)) return false;
      
      return true;
    }

    function add(dateKey, item) {
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(item);
    }

    // 1. Manual events (skip auto-synced process events since processes list renders them richly below)
    events.forEach(e => {
      if (e.process_id) return;
      const participantIds = e.participants ? e.participants.map(p => p.id) : [];
      const involvedUserIds = [e.created_by, ...participantIds];
      
      if (filterUser1 && !involvedUserIds.includes(filterUser1)) return;
      if (filterUser2 && !involvedUserIds.includes(filterUser2)) return;

      add(e.event_date, {
        id: `event-${e.id}`,
        rawId: e.id,
        type: 'event',
        title: e.title,
        description: e.description,
        time: e.event_time,
        creator: e.created_by_name,
        participants: e.participants,
        colorClass: 'evt-gold'
      });
    });

    // 2. Birthdays (Format: YYYY-MM-DD but birth_date is database stored)
    birthdays.forEach(b => {
      if (filterUser1 && b.user_id !== filterUser1) return;
      if (filterUser2 && b.user_id !== filterUser2) return;

      const bMonth = parseInt(b.birth_date.split('-')[1], 10);
      const bDay = parseInt(b.birth_date.split('-')[2], 10);
      if (bMonth === month + 1) {
        const dateKey = `${year}-${String(bMonth).padStart(2, '0')}-${String(bDay).padStart(2, '0')}`;
        add(dateKey, {
          id: `bday-${b.user_id}`,
          type: 'birthday',
          title: `Bolo: ${b.full_name}`,
          colorClass: 'evt-pink'
        });
      }
    });

    // 3. Process Agendamentos & Interventions (with Process Name, Technician & Address/Locality)
    processes.forEach(p => {
      if (filterUser1 && p.manager_id !== filterUser1) return;
      if (filterUser2 && p.technician_id !== filterUser2) return;
      if (p.status !== 'ABERTO') return;

      const techLabel = p.technician_name || 'Sem Técnico';
      const techPhoneLabel = p.technician_phone ? ` (${p.technician_phone})` : '';
      const locLabel = p.address ? ` • 📍 ${p.address}` : '';
      const refLabel = p.client_code ? ` [Ref: ${p.client_code}]` : '';
      const schedDateKey = p.schedule_date ? p.schedule_date.split('T')[0] : null;
      const intervDateKey = p.next_intervention_date ? p.next_intervention_date.split('T')[0] : null;

      if (schedDateKey && schedDateKey !== intervDateKey) {
        add(schedDateKey, {
          id: `proc-sched-${p.id}`,
          type: 'schedule',
          title: `${p.process_id}${refLabel} (${p.client}) • 👤 ${techLabel}${techPhoneLabel}${locLabel}`,
          colorClass: 'evt-blue',
          time: p.schedule_date.includes('T') ? p.schedule_date.split('T')[1].substring(0, 5) : null,
          process: p
        });
      }

      if (intervDateKey) {
        const timeVal = (p.next_intervention_date.includes('T') ? p.next_intervention_date.split('T')[1].substring(0, 5) : null)
          || (schedDateKey === intervDateKey && p.schedule_date?.includes('T') ? p.schedule_date.split('T')[1].substring(0, 5) : null);

        add(intervDateKey, {
          id: `proc-interv-${p.id}`,
          type: 'intervention',
          title: `${p.process_id}${refLabel} (${p.client}) • 👤 ${techLabel}${techPhoneLabel}${locLabel}`,
          colorClass: 'evt-orange',
          time: timeVal,
          process: p
        });
      }
    });

    return map;
  }, [events, birthdays, processes, year, month, managerFilter, technicianFilter]);

  // Selected technician object helper
  const selectedTechUser = useMemo(() => {
    if (!technicianFilter) return null;
    return allUsers.find(u => String(u.id) === String(technicianFilter));
  }, [technicianFilter, allUsers]);

  // Derived filters
  const managers = useMemo(() => allUsers.filter(u => ['admin', 'key_user', 'both'].includes(u.role)), [allUsers]);
  const technicians = useMemo(() => {
    if (user?.role === 'technician') {
      return allUsers.filter(u => u.id === user?.id);
    }
    return allUsers.filter(u => ['technician', 'both', 'key_user'].includes(u.role));
  }, [allUsers, user]);

  // Navigate calendar
  function prevDate() {
    if (viewMode === 'month') {
      setCurrentDate(new Date(year, month - 1, 1));
    } else if (viewMode === 'week') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 1);
      setCurrentDate(d);
    }
  }

  function nextDate() {
    if (viewMode === 'month') {
      setCurrentDate(new Date(year, month + 1, 1));
    } else if (viewMode === 'week') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 1);
      setCurrentDate(d);
    }
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  // Generate week days
  const weekDays = useMemo(() => {
    const dayOfWeek = currentDate.getDay(); // 0 is Sunday
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - dayOfWeek);
    
    const daysArray = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      daysArray.push({
        day: d.getDate(),
        dateStr,
        date: d
      });
    }
    return daysArray;
  }, [currentDate]);

  // Generate single day
  const singleDay = useMemo(() => {
    const d = new Date(currentDate);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      day: d.getDate(),
      dateStr,
      date: d
    };
  }, [currentDate]);

  // For time grid
  const hours = Array.from({ length: 13 }, (_, i) => i + 8);

  // Quick Time Change Handler for Agenda View
  async function handleQuickTimeChange(evt, newTime) {
    if (!newTime) return;
    try {
      if (evt.process?.id) {
        let currentDateStr = evt.type === 'intervention'
          ? (evt.process.next_intervention_date ? evt.process.next_intervention_date.split('T')[0] : null)
          : (evt.process.schedule_date ? evt.process.schedule_date.split('T')[0] : null);

        if (!currentDateStr) {
          currentDateStr = selectedDateStr || `${singleDay.date.getFullYear()}-${String(singleDay.date.getMonth() + 1).padStart(2, '0')}-${String(singleDay.date.getDate()).padStart(2, '0')}`;
        }

        const newDateTime = `${currentDateStr}T${newTime}`;

        if (evt.type === 'intervention') {
          await api.put(`/processes/${evt.process.id}`, { next_intervention_date: newDateTime });
          toast.success('Hora da próxima intervenção atualizada!');
        } else {
          await api.put(`/processes/${evt.process.id}`, { schedule_date: newDateTime });
          toast.success('Hora de agendamento atualizada!');
        }
      } else if (evt.id && evt.type === 'event') {
        await api.put(`/events/${evt.id}`, { event_time: newTime });
        toast.success('Hora do evento atualizada!');
      }
      loadCalendarData();
    } catch (err) {
      toast.error(err.message || 'Erro ao atualizar hora.');
    }
  }

  // Day Click handler
  function handleDayClick(dayObj) {
    if (!dayObj) return;
    setSelectedDateStr(dayObj.dateStr);
    setShowDayDetails(true);
  }

  // Create Event Form handler
  async function handleCreateEvent(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        title: createForm.title,
        description: createForm.description,
        event_date: createForm.event_date,
        event_time: createForm.event_time || null,
        participant_ids: createForm.participant_ids.map(id => parseInt(id, 10))
      };

      await api.post('/events', payload);
      toast.success('Evento criado com sucesso!');
      setShowCreateModal(false);
      
      // Reset form
      setCreateForm({
        title: '',
        description: '',
        event_date: '',
        event_time: '',
        participant_ids: []
      });
      
      loadCalendarData();
    } catch (err) {
      toast.error(err.message || 'Erro ao criar evento.');
    } finally {
      setSaving(false);
    }
  }

  // Delete Event handler
  async function handleDeleteEvent(id) {
    if (!window.confirm('Tem a certeza que deseja eliminar este evento?')) return;
    try {
      await api.delete(`/events/${id}`);
      toast.success('Evento eliminado com sucesso!');
      loadCalendarData();
      setShowDayDetails(false);
    } catch (err) {
      toast.error(err.message || 'Erro ao eliminar evento.');
    }
  }

  // Participant selection helper
  function handleParticipantToggle(userId) {
    const id = String(userId);
    setCreateForm(prev => {
      const current = [...prev.participant_ids];
      const idx = current.indexOf(id);
      if (idx > -1) {
        current.splice(idx, 1);
      } else {
        current.push(id);
      }
      return { ...prev, participant_ids: current };
    });
  }

  // Selected Day details list
  const selectedDayEvents = selectedDateStr ? eventsByDate[selectedDateStr] || [] : [];
  
  // Upcoming Birthdays for the Month
  const currentMonthBirthdays = useMemo(() => {
    return birthdays.map(b => {
      const day = parseInt(b.birth_date.split('-')[2], 10);
      return { ...b, day };
    }).sort((a, b) => a.day - b.day);
  }, [birthdays]);

  return (
    <div className="calendar-layout">
      <Header />
      
      <main className="calendar-container animate-fade-in">
        
        {/* CALENDAR BODY & SIDEBAR SPLIT */}
        <div className="calendar-main-grid">
          
          {/* LEFT: CALENDAR GRID */}
          <div className="calendar-grid-panel glass-card" data-tour="calendar-view">
                   {/* NAVIGATION HEADER */}
            <div className="calendar-nav-bar" data-tour="calendar-header">
              <div className="nav-left">
                <h2>
                  {viewMode === 'month' && `${monthNames[month]} ${year}`}
                  {viewMode === 'week' && `Semana de ${weekDays[0].day} ${monthNames[weekDays[0].date.getMonth()]} ${weekDays[0].date.getFullYear()}`}
                  {viewMode === 'day' && `${singleDay.day} ${monthNames[singleDay.date.getMonth()]} ${singleDay.date.getFullYear()}`}
                  {viewMode === 'agenda' && `Agenda: ${singleDay.day} de ${monthNames[singleDay.date.getMonth()]} ${singleDay.date.getFullYear()}`}
                </h2>
              </div>
              <div className="nav-right">
                <select className="select-field view-select" data-tour="calendar-views-toggle" value={viewMode} onChange={e => setViewMode(e.target.value)}>
                  <option value="month">Mês</option>
                  <option value="week">Semana</option>
                  <option value="day">Dia</option>
                  <option value="agenda">📋 Agenda (O Meu Dia)</option>
                </select>
                <div className="calendar-filters-group" data-tour="calendar-filters" style={{ display: 'inline-flex', gap: '8px' }}>
                  {isAdmin && (
                    <select className="select-field" value={managerFilter} onChange={e => setManagerFilter(e.target.value)}>
                      <option value="">Gestor: Todos</option>
                      {managers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                    </select>
                  )}
                  <select className="select-field" value={technicianFilter} onChange={e => setTechnicianFilter(e.target.value)}>
                    <option value="">Técnico: Todos</option>
                    {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </select>
                </div>
                <button className="btn btn-outline" onClick={goToday}>Hoje</button>
                <button className="btn btn-outline nav-arrow" onClick={prevDate}>&lt;</button>
                <button className="btn btn-outline nav-arrow" onClick={nextDate}>&gt;</button>
                {isAdmin && (
                  <button 
                    className="btn btn-gold create-evt-btn"
                    onClick={() => {
                      setFormError('');
                      setShowCreateModal(true);
                    }}
                  >
                    + Novo Evento
                  </button>
                )}
              </div>
            </div>

            {error && <div className="error-banner">{error}</div>}
            
            <div className="calendar-filters-bar glass-card">
              <select className="select-field" value={managerFilter} onChange={e => setManagerFilter(e.target.value)}>
                <option value="">Gestor: Todos</option>
                {managers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
              <select className="select-field" value={technicianFilter} onChange={e => setTechnicianFilter(e.target.value)}>
                {user?.role !== 'technician' && <option value="">Técnico: Todos</option>}
                {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>

            {loading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>A carregar calendário...</p>
              </div>
            ) : (
              <>
                {viewMode === 'month' && (
                  <div className="month-grid">
                    {/* DAY OF WEEK LABELS */}
                    {dayNames.map(d => (
                      <div key={d} className="weekday-label">{d}</div>
                    ))}

                    {/* DAY CELLS */}
                    {calendarDays.map((dayObj, idx) => {
                      if (!dayObj) {
                        return <div key={`empty-${idx}`} className="day-cell day-empty"></div>;
                      }

                      const dateEvents = eventsByDate[dayObj.dateStr] || [];
                      const isToday = new Date().toDateString() === dayObj.date.toDateString();
                      const isSelected = selectedDateStr === dayObj.dateStr;

                      return (
                        <div 
                          key={dayObj.dateStr} 
                          className={`day-cell ${isToday ? 'day-today' : ''} ${isSelected ? 'day-selected' : ''}`}
                          onClick={() => handleDayClick(dayObj)}
                        >
                          <span className="day-number">{dayObj.day}</span>
                          
                          <div className="day-events-list">
                            {dateEvents.slice(0, 3).map(evt => (
                              <div
                                key={evt.id}
                                className={`event-pill ${evt.colorClass}`}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  if (evt.process?.id) setSelectedProcessId(evt.process.id);
                                }}
                              >
                                {evt.type === 'birthday' && '🎂 '}
                                {evt.title}
                              </div>
                            ))}
                            {dateEvents.length > 3 && (
                              <div className="more-events-badge">+{dateEvents.length - 3} mais</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {(viewMode === 'week' || viewMode === 'day') && (
                  <div className="time-grid-container glass-card">
                    <div className="time-grid-header">
                      <div className="time-column-header"></div>
                      {(viewMode === 'week' ? weekDays : [singleDay]).map(dayObj => (
                        <div key={dayObj.dateStr} className={`day-column-header ${new Date().toDateString() === dayObj.date.toDateString() ? 'today' : ''}`}>
                           <div className="day-name">{dayNames[dayObj.date.getDay()]}</div>
                           <div className="day-number">{dayObj.day}</div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="time-grid-body">
                      {/* All Day Row */}
                      <div className="time-row all-day-row">
                         <div className="time-label">Dia Todo</div>
                         <div className="days-row">
                           {(viewMode === 'week' ? weekDays : [singleDay]).map(dayObj => {
                             const dateEvents = eventsByDate[dayObj.dateStr] || [];
                             const allDayEvents = dateEvents.filter(e => !e.time);
                             return (
                               <div key={dayObj.dateStr} className="time-cell all-day-cell">
                                 {allDayEvents.map(evt => (
                                   <div
                                     key={evt.id}
                                     className={`event-pill ${evt.colorClass}`}
                                     onClick={() => handleDayClick(dayObj)}
                                     onDoubleClick={(e) => {
                                       e.stopPropagation();
                                       if (evt.process?.id) setSelectedProcessId(evt.process.id);
                                     }}
                                   >
                                     {evt.type === 'birthday' && '🎂 '}
                                     {evt.title}
                                   </div>
                                 ))}
                               </div>
                             );
                           })}
                         </div>
                      </div>
                      
                      {/* Hourly Rows */}
                      {hours.map(hour => (
                        <div key={hour} className="time-row">
                          <div className="time-label">{String(hour).padStart(2, '0')}:00</div>
                          <div className="days-row">
                            {(viewMode === 'week' ? weekDays : [singleDay]).map(dayObj => {
                              const dateEvents = eventsByDate[dayObj.dateStr] || [];
                              const hourEvents = dateEvents.filter(e => e.time && parseInt(e.time.split(':')[0], 10) === hour);
                              return (
                                <div key={dayObj.dateStr} className="time-cell" onClick={() => handleDayClick(dayObj)}>
                                  {hourEvents.map(evt => (
                                    <div
                                      key={evt.id}
                                      className={`event-pill ${evt.colorClass} timed-event`}
                                      onDoubleClick={(e) => {
                                        e.stopPropagation();
                                        if (evt.process?.id) setSelectedProcessId(evt.process.id);
                                      }}
                                    >
                                      <span className="evt-time">{evt.time}</span> {evt.title}
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {viewMode === 'agenda' && (() => {
                  const rawDayEvents = eventsByDate[selectedDateStr || singleDay.dateStr] || [];
                  const dayEventsList = [...rawDayEvents].sort((a, b) => {
                    const timeA = a.time && a.time !== 'Dia Todo' ? a.time : '99:99';
                    const timeB = b.time && b.time !== 'Dia Todo' ? b.time : '99:99';
                    return timeA.localeCompare(timeB);
                  });

                  const routeStops = dayEventsList
                    .filter(evt => evt.process && (evt.process.address || evt.process.client))
                    .map(evt => {
                      const rawAddr = evt.process?.address || evt.process?.client || '';
                      return {
                        id: evt.id,
                        time: evt.time || 'Sem Hora',
                        client: evt.process?.client || evt.title,
                        address: rawAddr.trim(),
                        processId: evt.process?.id,
                        displayId: evt.process?.process_id
                      };
                    })
                    .filter(stop => stop.address.length > 0);

                  let mapsUrl = null;
                  let iframeSrc = null;
                  if (routeStops.length > 0) {
                    const encodedAddresses = routeStops.map(s => encodeURIComponent(s.address));
                    if (routeStops.length === 1) {
                      mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddresses[0]}`;
                      iframeSrc = `https://maps.google.com/maps?q=${encodedAddresses[0]}&t=&z=13&ie=UTF8&iwloc=&output=embed`;
                    } else {
                      // Multi-stop route deep link preserving exact order 1..N
                      mapsUrl = `https://www.google.com/maps/dir/${encodedAddresses.join('/')}`;
                      // Embedded iframe for multi-stop route
                      const origin = encodedAddresses[0];
                      const destinations = encodedAddresses.slice(1).join('+to:');
                      iframeSrc = `https://maps.google.com/maps?saddr=${origin}&daddr=${destinations}&output=embed`;
                    }
                  }

                  return (
                    <div className="agenda-view-container glass-card animate-fade-in">
                      <div className="agenda-header-bar">
                        <div>
                          <h3>
                            📅 Agenda {selectedTechUser ? `de ${selectedTechUser.full_name}` : ''} ({selectedDateStr ? `${selectedDateStr.split('-')[2]}/${selectedDateStr.split('-')[1]}/${selectedDateStr.split('-')[0]}` : `${singleDay.day} de ${monthNames[month]}`})
                          </h3>
                          {selectedTechUser && user?.role !== 'technician' && (
                            <span className="tech-viewing-badge">
                              👁️ A visualizar vista de: <strong>{selectedTechUser.full_name}</strong>
                            </span>
                          )}
                        </div>
                        <span className="agenda-count-badge">
                          {dayEventsList.length} compromissos
                        </span>
                      </div>

                      <div className={`agenda-split-grid ${routeStops.length > 0 ? 'has-map' : 'no-map'}`}>
                        {/* LEFT COLUMN: LIST OF PROCESSES / EVENTS */}
                        <div className="agenda-events-col">
                          <h4 className="agenda-section-title">📋 Lista de Intervenções & Eventos</h4>

                          {dayEventsList.length === 0 ? (
                            <div className="no-events-agenda">
                              <span style={{ fontSize: '2.5rem' }}>☕</span>
                              <p>Sem compromissos ou intervenções agendadas para este dia.</p>
                            </div>
                          ) : (
                            <div className="agenda-timeline-list">
                              {dayEventsList.map(evt => {
                                const isOnlyTech = user?.role === 'technician';
                                const isMyProcess = evt.process ? evt.process.technician_id === user?.id : true;
                                const isEditablePhase = evt.process
                                  ? ['FILA', 'AGENDADO', 'PENDENTE'].includes(evt.process.milestone) && evt.process.status !== 'FECHADO'
                                  : true;
                                const canEditQuickTime = !isOnlyTech || (isMyProcess && isEditablePhase);

                                return (
                                  <div
                                    key={evt.id}
                                    className={`agenda-card ${evt.colorClass}`}
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      if (evt.process?.id) setSelectedProcessId(evt.process.id);
                                    }}
                                  >
                                    <div className="agenda-card-time">
                                      <div className="agenda-time-picker-box">
                                        <span className="agenda-time-icon">🕒</span>
                                        <InlineTimePicker
                                          className="agenda-inline-time-input"
                                          value={evt.time && evt.time !== 'Dia Todo' ? evt.time : ''}
                                          disabled={!canEditQuickTime}
                                          onSave={newTime => handleQuickTimeChange(evt, newTime)}
                                          title={canEditQuickTime ? "Alterar hora rapidamente" : "Sem permissão para alterar hora nesta fase"}
                                        />
                                      </div>
                                      <span className="agenda-type-tag">
                                        {evt.type === 'birthday' ? '🎂 Aniversário' : evt.type === 'schedule' ? '📅 Agendamento' : evt.type === 'intervention' ? '⚠️ Intervenção' : '🤝 Evento'}
                                      </span>
                                    </div>
                                    <div className="agenda-card-content">
                                      <h4>{evt.title}</h4>
                                      {evt.description && <p className="agenda-desc">{evt.description}</p>}
                                      {evt.process && (
                                        <div className="agenda-process-info-box">
                                          <div className="agenda-process-info">
                                            <span><strong>Cliente:</strong> {evt.process.client}</span>
                                            {evt.process.client_code && (
                                              <span>🔗 <strong>Ref.ª Cliente:</strong> {evt.process.client_code}</span>
                                            )}
                                            <span>👤 <strong>Técnico:</strong> {evt.process.technician_name || 'Sem Técnico'}</span>
                                            {(evt.process.technician_phone || evt.process.technician_email) && (
                                              <span>📞 <strong>Contacto:</strong> {[evt.process.technician_phone, evt.process.technician_email].filter(Boolean).join(' | ')}</span>
                                            )}
                                            <span className="badge-milestone">{evt.process.milestone}</span>
                                            <button
                                              className="btn btn-outline btn-xs"
                                              onClick={() => setSelectedProcessId(evt.process.id)}
                                            >
                                              Abrir Processo ↗
                                            </button>
                                          </div>
                                          {evt.process.address && (
                                            <div className="agenda-address-tag">
                                              📍 <strong>Morada:</strong> {evt.process.address}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* RIGHT COLUMN: ROUTE & MAP */}
                        {routeStops.length > 0 && (
                          <div className="agenda-map-col">
                            <div className="agenda-route-widget glass-card">
                              <div className="route-widget-header">
                                <div>
                                  <h4>🚗 Rota & Mapa de Deslocação</h4>
                                  <p className="route-subtitle">{routeStops.length} {routeStops.length === 1 ? 'local' : 'locais'} a visitar hoje</p>
                                </div>
                                {mapsUrl && (
                                  <a
                                    href={mapsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-gold btn-sm"
                                  >
                                    🗺️ Abrir no Google Maps ↗
                                  </a>
                                )}
                              </div>

                              <div className="route-stops-timeline">
                                {routeStops.map((stop, idx) => (
                                  <div key={stop.id || idx} className="route-stop-item">
                                    <div className="stop-number-badge">{idx + 1}</div>
                                    <div className="stop-info">
                                      <div className="stop-header-line">
                                        <InlineTimePicker
                                          className="stop-inline-time-input"
                                          value={stop.time !== 'Sem Hora' && stop.time !== 'Dia Todo' ? stop.time : ''}
                                          onSave={newTime => {
                                            const fullEvt = dayEventsList.find(ev => ev.id === stop.id);
                                            if (fullEvt) handleQuickTimeChange(fullEvt, newTime);
                                          }}
                                          title="Alterar hora"
                                        />
                                        <strong>{stop.client}</strong> <span className="stop-proc-tag">({stop.displayId})</span>
                                      </div>
                                      <div className="stop-address">📍 {stop.address}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {iframeSrc && (
                                <div className="route-map-preview">
                                  <iframe
                                    title="Mapa da Rota"
                                    width="100%"
                                    height="280"
                                    style={{ border: 0, borderRadius: '8px' }}
                                    loading="lazy"
                                    allowFullScreen
                                    src={iframeSrc}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* RIGHT: SIDEBAR (DAY DETAILS) */}
          {showDayDetails && (
            <div className="calendar-sidebar">
              <div className="sidebar-widget day-details-widget glass-card animate-slide-up">
                <div className="widget-header">
                  <h3>
                    Dia {selectedDateStr?.split('-')[2]}/{selectedDateStr?.split('-')[1]}
                  </h3>
                  <button className="close-widget-btn" onClick={() => setShowDayDetails(false)}>&times;</button>
                </div>
                
                <div className="widget-content">
                  {selectedDayEvents.length === 0 ? (
                    <p className="no-events-msg">Sem eventos ou prazos agendados para este dia.</p>
                  ) : (
                    <div className="day-events-full-list">
                      {selectedDayEvents.map(evt => (
                        <div
                          key={evt.id}
                          className={`full-event-card ${evt.colorClass}`}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (evt.process?.id) setSelectedProcessId(evt.process.id);
                          }}
                        >
                          <div className="full-event-header">
                            <span className="evt-type-icon">
                              {evt.type === 'birthday' ? '🎂' : evt.type === 'schedule' ? '📅' : evt.type === 'intervention' ? '⚠️' : '🤝'}
                            </span>
                            <h4>{evt.title}</h4>
                            
                            {evt.type === 'event' && (isAdmin || evt.creator === user?.full_name) && (
                              <button 
                                className="del-evt-btn"
                                onClick={() => handleDeleteEvent(evt.rawId)}
                              >
                                &times;
                              </button>
                            )}
                          </div>
                          
                          {evt.description && <p className="evt-desc">{evt.description}</p>}
                          {evt.time && <div className="evt-meta">🕒 {evt.time}</div>}
                          {evt.process && (
                            <>
                              {evt.process.client_code && (
                                <div className="evt-meta">🔗 <strong>Ref.ª Cliente:</strong> {evt.process.client_code}</div>
                              )}
                              <div className="evt-meta">👤 <strong>Técnico:</strong> {evt.process.technician_name || 'Sem Técnico'}</div>
                              {(evt.process.technician_phone || evt.process.technician_email) && (
                                <div className="evt-meta">📞 <strong>Contacto:</strong> {[evt.process.technician_phone, evt.process.technician_email].filter(Boolean).join(' | ')}</div>
                              )}
                              <div className="evt-meta">📍 <strong>Localidade/Morada:</strong> {evt.process.address || 'Não definida'}</div>
                              <button
                                className="btn btn-outline btn-xs"
                                style={{ marginTop: '6px' }}
                                onClick={() => setSelectedProcessId(evt.process.id)}
                              >
                                Abrir Processo ↗
                              </button>
                            </>
                          )}
                          {evt.creator && <div className="evt-meta">👤 Criador: {evt.creator}</div>}
                          
                          {evt.participants && evt.participants.length > 0 && (
                            <div className="evt-participants">
                              <strong>Participantes:</strong>
                              <div className="participants-pills">
                                {evt.participants.map(p => (
                                  <span key={p.id} className="participant-pill">{p.full_name}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* CREATE EVENT MODAL */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content event-modal animate-scale-in">
            <div className="modal-header">
              <h3>Novo Evento Manual</h3>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>&times;</button>
            </div>
            
            <form onSubmit={handleCreateEvent} className="event-form">
              {formError && <div className="error-banner">{formError}</div>}
              
              <div className="form-group">
                <label>Título do Evento</label>
                <input 
                  type="text"
                  className="input-field"
                  required
                  placeholder="Ex: Reunião com João"
                  value={createForm.title}
                  onChange={e => setCreateForm(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>Descrição</label>
                <textarea 
                  className="input-field textarea-field"
                  placeholder="Mais pormenores sobre o evento..."
                  value={createForm.description}
                  onChange={e => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Data</label>
                  <input 
                    type="date"
                    className="input-field"
                    required
                    value={createForm.event_date}
                    onChange={e => setCreateForm(prev => ({ ...prev, event_date: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label>Hora (opcional)</label>
                  <input 
                    type="time"
                    className="input-field"
                    value={createForm.event_time}
                    onChange={e => setCreateForm(prev => ({ ...prev, event_time: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Selecionar Participantes (Equipa)</label>
                <div className="participants-selection-box">
                  {users.map(u => {
                    const isSelected = createForm.participant_ids.includes(String(u.id));
                    return (
                      <div 
                        key={u.id}
                        className={`participant-selection-row ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleParticipantToggle(u.id)}
                      >
                        <span className="checkbox-indicator">{isSelected ? '✓' : ''}</span>
                        <div className="user-text">
                          <strong>{u.full_name}</strong>
                          <span>{u.role_name || u.role}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowCreateModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-gold" disabled={saving}>
                  {saving ? 'A criar...' : 'Criar Evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROCESS DETAIL MODAL */}
      {selectedProcessId && (
        <ProcessDetailModal
          processId={selectedProcessId}
          onClose={() => setSelectedProcessId(null)}
          onUpdate={loadCalendarData}
        />
      )}
    </div>
  );
}
