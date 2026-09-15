import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import {
  PSATicket,
  TicketPriority,
  TicketStatus
} from '../../types';
import {
  Plus,
  Clock,
  Sparkles,
  DollarSign,
  X,
  Send,
  Laptop,
  Kanban,
  ListFilter,
  Filter,
  Columns,
  Search,
  CheckCircle2,
  AlertCircle,
  MoreHorizontal,
  Ticket as TicketIcon,
  ChevronRight
} from 'lucide-react';

export const PSATicketsView: React.FC = () => {
  const {
    tickets,
    selectedTicketId,
    setSelectedTicketId,
    clients,
    devices,
    selectedClientId,
    createTicket,
    updateTicketStatus,
    addTicketComment,
    addTicketTimeEntry,
    launchRustDeskSession,
    setIsAiDrawerOpen
  } = useApp();

  const filteredTickets = selectedClientId === 'all'
    ? tickets
    : tickets.filter(t => t.clientId === selectedClientId);

  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // New Ticket Form
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDesc, setTicketDesc] = useState('');
  const [clientId, setClientId] = useState(clients[0]?.id || '');
  const [deviceId, setDeviceId] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [category, setCategory] = useState<PSATicket['category']>('Hardware');

  // Comment & Time Entry State
  const [commentText, setCommentText] = useState('');
  const [isInternalComment, setIsInternalComment] = useState(false);
  const [timeMinutes, setTimeMinutes] = useState(30);
  const [timeDesc, setTimeDesc] = useState('Diagnostic and remote remediation');

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  const displayedTickets = filteredTickets.filter(t => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.ticketNumber.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      t.clientName.toLowerCase().includes(q) ||
      t.assignedTech.toLowerCase().includes(q)
    );
  });

  const handleCreateTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketTitle.trim()) return;

    const client = clients.find(c => c.id === clientId);
    const device = devices.find(d => d.id === deviceId);

    createTicket({
      title: ticketTitle,
      description: ticketDesc,
      clientId,
      clientName: client?.name || 'Unknown Client',
      deviceId: device?.id,
      deviceName: device?.name,
      priority,
      status: 'new',
      category,
      assignedTech: 'Alex Rivera (Tier 2)',
      slaDueDate: 'In 4 hours',
      slaBreached: false
    });

    setShowCreateModal(false);
    setTicketTitle('');
    setTicketDesc('');
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !commentText.trim()) return;
    addTicketComment(selectedTicket.id, commentText, isInternalComment, 'tech');
    setCommentText('');
  };

  const handleAddTime = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || timeMinutes <= 0) return;
    addTicketTimeEntry(selectedTicket.id, timeMinutes, timeDesc, true);
    setTimeDesc('Diagnostic and remote remediation');
  };

  const getPriorityPill = (p: TicketPriority) => {
    switch (p) {
      case 'urgent':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#fee2e2] text-[#991b1b]">Urgent</span>;
      case 'high':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#fef3c7] text-[#92400e]">High</span>;
      case 'medium':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#e0f2fe] text-[#0369a1]">Medium</span>;
      case 'low':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#f1f5f9] text-[#475569]">Low</span>;
    }
  };

  const getStatusPill = (s: TicketStatus) => {
    switch (s) {
      case 'new':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#e3edff] text-[#1d4ed8]">New</span>;
      case 'in_progress':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#e0e7ff] text-[#4338ca]">In Progress</span>;
      case 'waiting_on_client':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#fef3c7] text-[#b45309]">Waiting on Client</span>;
      case 'resolved':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#c8e6c5] text-[#1e541b]">Resolved</span>;
      case 'closed':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#ececec] text-[#555555]">Closed</span>;
    }
  };

  const getIdBadge = (ticketNum: string) => {
    const hash = ticketNum.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colors = [
      'bg-[#f7c1c1] text-[#781717]',
      'bg-[#fadcbf] text-[#823a00]',
      'bg-[#e2e8f0] text-[#334155]',
      'bg-[#d1fae5] text-[#065f46]',
      'bg-[#e0e7ff] text-[#3730a3]',
    ];
    const color = colors[hash % colors.length];
    return (
      <span className={`inline-flex items-center justify-center font-mono font-bold text-xs px-2 py-0.5 rounded ${color}`}>
        {ticketNum}
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#f4f6f8] text-[#1a1a24] overflow-hidden">
      {/* SuperOps Action Toolbar */}
      <div className="min-h-14 bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 sm:py-0 flex flex-wrap items-center justify-between gap-2 sm:gap-4 shrink-0 shadow-sm">
        {/* Left: Title + Scope */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded border border-slate-200 flex items-center justify-center text-slate-500 bg-slate-50">
            <TicketIcon className="w-4 h-4" />
          </div>
          <h1 className="text-base sm:text-lg font-bold text-[#212b36] tracking-tight flex items-center gap-1.5">
            <span>Tickets</span>
            <span className="text-slate-400 text-sm font-normal">🌐</span>
          </h1>
          <span className="text-xs text-slate-500 font-medium ml-1">
            ({displayedTickets.length})
          </span>
        </div>

        {/* Right: SuperOps Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600">
            <button
              onClick={() => setViewMode('list')}
              className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'}`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition ${viewMode === 'kanban' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'}`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>
          </div>

          {/* Columns - hidden on mobile */}
          <button className="hidden sm:flex h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium items-center gap-1.5 transition">
            <Columns className="w-3.5 h-3.5 text-slate-500" />
            <span>Columns</span>
          </button>

          {/* Filter - hidden on mobile */}
          <button className="hidden sm:flex h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium items-center gap-1.5 transition">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span>Filter</span>
          </button>

          {/* Create Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="h-8 px-3.5 rounded-lg bg-[#090113] hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Create</span>
          </button>
        </div>
      </div>

      {/* Subheader: Filter Bar & Search */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2 flex items-center justify-between gap-3 shrink-0">
        <div className="relative flex-1 sm:w-80 sm:flex-initial">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search tickets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-purple-500 transition"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
          <span className="font-semibold text-slate-700 hidden xs:inline">Open:</span>
          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold">
            {tickets.filter(t => t.status !== 'closed' && t.status !== 'resolved').length}
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Left: Table or Kanban */}
        {viewMode === 'list' ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6 pb-20 md:pb-6">
            {/* Mobile Ticket Cards View (md:hidden) */}
            <div className="block md:hidden space-y-2.5">
              {displayedTickets.map(ticket => {
                const isSelected = ticket.id === selectedTicketId;
                return (
                  <div
                    key={ticket.id}
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={`p-3.5 rounded-xl border bg-white shadow-xs transition active:scale-[0.99] cursor-pointer ${
                      isSelected ? 'border-purple-500 ring-2 ring-purple-100' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        {getIdBadge(ticket.ticketNumber)}
                        {getStatusPill(ticket.status)}
                      </div>
                      {getPriorityPill(ticket.priority)}
                    </div>

                    <h4 className="font-bold text-slate-900 text-sm leading-snug mb-1">
                      {ticket.title}
                    </h4>

                    {ticket.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 mb-2.5">
                        {ticket.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-1 truncate max-w-[180px]">
                        <span className="font-semibold text-slate-700 truncate">{ticket.clientName}</span>
                        {ticket.deviceName && (
                          <span className="text-slate-400">• {ticket.deviceName}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Clock className={`w-3.5 h-3.5 ${ticket.slaBreached ? 'text-rose-500' : 'text-slate-400'}`} />
                        <span className={ticket.slaBreached ? 'text-rose-600 font-bold' : ''}>
                          {ticket.slaDueDate}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[10px] text-slate-400">
                        Tech: <strong className="text-slate-600">{ticket.assignedTech}</strong>
                      </span>
                      <div className="flex items-center gap-2">
                        {ticket.deviceId && (
                          <button
                            onClick={() => launchRustDeskSession(ticket.deviceId!)}
                            className="px-2.5 py-1 rounded-md bg-[#090113] hover:bg-slate-800 text-white font-medium text-xs flex items-center gap-1 transition"
                          >
                            <Laptop className="w-3.5 h-3.5 text-sky-400" />
                            <span>Remote</span>
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedTicketId(ticket.id)}
                          className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {displayedTickets.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No tickets match your current filters.
                </div>
              )}
            </div>

            {/* Desktop Table View (hidden md:block) */}
            <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4 w-20">ID</th>
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4">Client / Asset</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Priority</th>
                    <th className="py-3 px-4">SLA Target</th>
                    <th className="py-3 px-4">Assignee</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedTickets.map(ticket => {
                    const isSelected = ticket.id === selectedTicketId;
                    return (
                      <tr
                        key={ticket.id}
                        onClick={() => setSelectedTicketId(ticket.id)}
                        className={`hover:bg-purple-50/30 cursor-pointer transition ${isSelected ? 'bg-purple-50/60 font-medium' : ''}`}
                      >
                        {/* ID Badge */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {getIdBadge(ticket.ticketNumber)}
                        </td>

                        {/* Subject */}
                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-semibold text-[#011fff] hover:underline cursor-pointer line-clamp-1">
                            {ticket.title}
                          </div>
                          <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                            {ticket.description}
                          </div>
                        </td>

                        {/* Client & Device */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-medium text-slate-900">{ticket.clientName}</div>
                          {ticket.deviceName && (
                            <div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <Laptop className="w-3 h-3 text-slate-400" />
                              <span>{ticket.deviceName}</span>
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {getStatusPill(ticket.status)}
                        </td>

                        {/* Priority */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {getPriorityPill(ticket.priority)}
                        </td>

                        {/* SLA */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-slate-600 text-[11px]">
                            <Clock className={`w-3.5 h-3.5 ${ticket.slaBreached ? 'text-rose-500' : 'text-slate-400'}`} />
                            <span className={ticket.slaBreached ? 'text-rose-600 font-bold' : ''}>
                              {ticket.slaDueDate}
                            </span>
                          </div>
                        </td>

                        {/* Assignee */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-[10px]">
                              {ticket.assignedTech.charAt(0)}
                            </div>
                            <span className="text-slate-700">{ticket.assignedTech}</span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {ticket.deviceId && (
                              <button
                                onClick={() => launchRustDeskSession(ticket.deviceId!)}
                                className="px-2 py-1 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold text-[11px] flex items-center gap-1 border border-purple-200 transition"
                                title="Connect with ApexConnect"
                              >
                                <Laptop className="w-3 h-3" />
                                <span>Remote</span>
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedTicketId(ticket.id)}
                              className="p-1.5 rounded hover:bg-slate-100 text-slate-500 transition"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {displayedTickets.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                        No tickets match your current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Kanban Board View */
          <div className="flex-1 p-6 overflow-x-auto custom-scrollbar">
            <div className="flex gap-4 min-w-max h-full">
              {(['new', 'in_progress', 'waiting_on_client', 'resolved', 'closed'] as TicketStatus[]).map(status => {
                const colTickets = displayedTickets.filter(t => t.status === status);
                const colLabels: Record<TicketStatus, string> = {
                  new: 'New',
                  in_progress: 'In Progress',
                  waiting_on_client: 'Waiting on Client',
                  resolved: 'Resolved',
                  closed: 'Closed'
                };
                return (
                  <div key={status} className="w-72 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-xs uppercase">{colLabels[status]}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">{colTickets.length}</span>
                    </div>
                    <div className="flex-1 p-3 space-y-2.5 overflow-y-auto custom-scrollbar bg-[#f8fafc]">
                      {colTickets.map(ticket => {
                        const isSelected = ticket.id === selectedTicketId;
                        return (
                          <div
                            key={ticket.id}
                            onClick={() => setSelectedTicketId(ticket.id)}
                            className={`p-3.5 rounded-xl border transition cursor-pointer bg-white shadow-xs hover:shadow-sm ${
                              isSelected ? 'border-purple-500 ring-2 ring-purple-100' : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-2">
                              {getIdBadge(ticket.ticketNumber)}
                              {getPriorityPill(ticket.priority)}
                            </div>
                            <h4 className="font-semibold text-slate-900 text-xs line-clamp-2 mb-1">{ticket.title}</h4>
                            <div className="text-[11px] text-slate-500 flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                              <span>{ticket.clientName}</span>
                              <span className="text-slate-400 font-medium">{ticket.slaDueDate}</span>
                            </div>
                          </div>
                        );
                      })}
                      {colTickets.length === 0 && (
                        <div className="p-6 text-center text-slate-400 text-xs">No tickets in this column</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Right: Selected Ticket Detail & Workbench Drawer */}
        {selectedTicket && (
          <div className="fixed inset-0 z-50 w-full md:relative md:w-[480px] md:inset-auto md:z-auto bg-white border-l border-slate-200 flex flex-col shrink-0 shadow-2xl md:shadow-lg overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2 min-w-0">
                {getIdBadge(selectedTicket.ticketNumber)}
                <h2 className="font-bold text-slate-900 text-sm truncate max-w-[200px] sm:max-w-[280px]">
                  {selectedTicket.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedTicketId(null)}
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition flex items-center gap-1"
              >
                <span className="text-xs font-semibold md:hidden">Close</span>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Status Bar */}
            <div className="p-3 bg-white border-b border-slate-200 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">Status:</span>
                <select
                  value={selectedTicket.status}
                  onChange={(e) => updateTicketStatus(selectedTicket.id, e.target.value as TicketStatus)}
                  className="bg-slate-50 border border-slate-200 text-slate-900 font-semibold px-2 py-1 rounded-md outline-none cursor-pointer text-xs"
                >
                  <option value="new">NEW</option>
                  <option value="in_progress">IN PROGRESS</option>
                  <option value="waiting_on_client">WAITING ON CLIENT</option>
                  <option value="resolved">RESOLVED</option>
                  <option value="closed">CLOSED</option>
                </select>
              </div>

              {selectedTicket.deviceId && (
                <button
                  onClick={() => launchRustDeskSession(selectedTicket.deviceId!)}
                  className="px-2.5 py-1 rounded-md bg-[#090113] hover:bg-slate-800 text-white font-medium text-xs flex items-center gap-1.5 transition shadow-xs"
                >
                  <Laptop className="w-3.5 h-3.5 text-sky-400" />
                  <span>Remote Desk</span>
                </button>
              )}
            </div>

            {/* Ticket Scroll Content */}
            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-4 text-xs">
              {/* Description Box */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="text-slate-500 font-bold text-[11px] uppercase tracking-wider">Ticket Description</div>
                <p className="text-slate-800 leading-relaxed">{selectedTicket.description}</p>
                <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-2 border-t border-slate-200">
                  <span>Client: <strong className="text-slate-700">{selectedTicket.clientName}</strong></span>
                  <span>Category: <strong className="text-slate-700">{selectedTicket.category}</strong></span>
                </div>
              </div>

              {/* AI Suggested Resolution Box */}
              {selectedTicket.aiSuggestedFix && (
                <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 space-y-2">
                  <div className="flex items-center justify-between text-purple-900 font-bold">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-600" /> Apex AI Root Cause & Remediation
                    </span>
                  </div>
                  <p className="text-purple-800 leading-relaxed text-[11px] font-medium">{selectedTicket.aiSuggestedFix}</p>
                </div>
              )}

              {/* Comments Timeline */}
              <div className="space-y-3">
                <div className="font-bold text-slate-800 flex items-center justify-between">
                  <span>Conversation & Notes</span>
                  <span className="text-[11px] text-slate-400 font-normal">({selectedTicket.comments.length} entries)</span>
                </div>
                {selectedTicket.comments.map(c => (
                  <div
                    key={c.id}
                    className={`p-3 rounded-xl border space-y-1 ${
                      c.isInternal
                        ? 'bg-amber-50/60 border-amber-200 text-amber-900'
                        : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold">
                      <span className={c.authorRole === 'ai_copilot' ? 'text-purple-700 flex items-center gap-1' : 'text-slate-900'}>
                        {c.authorRole === 'ai_copilot' && <Sparkles className="w-3 h-3" />}
                        {c.author}
                      </span>
                      <span className="text-slate-400 text-[10px]">{c.timestamp}</span>
                    </div>
                    <p className="text-xs leading-normal">{c.content}</p>
                  </div>
                ))}
              </div>

              {/* Add Comment Input */}
              <form onSubmit={handleAddComment} className="space-y-2 pt-2 border-t border-slate-200">
                <textarea
                  rows={2}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Type technician reply or internal note..."
                  className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs outline-none focus:bg-white focus:border-purple-500 transition"
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isInternalComment}
                      onChange={(e) => setIsInternalComment(e.target.checked)}
                      className="rounded border-slate-300 text-purple-600"
                    />
                    <span>Internal Technician Note</span>
                  </label>
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-[#090113] hover:bg-slate-800 text-white font-semibold text-xs flex items-center gap-1 shadow-xs transition"
                  >
                    <Send className="w-3 h-3" /> Post Note
                  </button>
                </div>
              </form>

              {/* Time Tracking Log */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-600" /> Billable Time Log
                  </span>
                  <span className="text-emerald-700 font-mono font-bold">
                    Total: {selectedTicket.timeEntries.reduce((a, b) => a + b.minutes, 0)} mins
                  </span>
                </div>

                <form onSubmit={handleAddTime} className="flex items-center gap-2">
                  <input
                    type="number"
                    value={timeMinutes}
                    onChange={(e) => setTimeMinutes(Number(e.target.value))}
                    className="w-16 p-1.5 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs font-mono outline-none"
                  />
                  <input
                    type="text"
                    value={timeDesc}
                    onChange={(e) => setTimeDesc(e.target.value)}
                    className="flex-1 p-1.5 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs outline-none"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs"
                  >
                    Log Time
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <form onSubmit={handleCreateTicketSubmit} className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="font-bold text-slate-900 text-base">Create New PSA Ticket</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Ticket Subject</label>
              <input
                type="text"
                required
                value={ticketTitle}
                onChange={(e) => setTicketTitle(e.target.value)}
                placeholder="e.g. Printer Spooler Failing on Executive Laptop"
                className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs outline-none focus:bg-white focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
              <textarea
                rows={3}
                value={ticketDesc}
                onChange={(e) => setTicketDesc(e.target.value)}
                placeholder="Detailed client issue report..."
                className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs outline-none focus:bg-white focus:border-purple-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Client Tenant</label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 outline-none"
                >
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Priority SLA</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TicketPriority)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#090113] hover:bg-slate-800 text-white font-semibold text-xs shadow-sm transition"
              >
                Submit Ticket
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
