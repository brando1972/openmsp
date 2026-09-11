import React, { useState } from 'react';
import { useApp } from '../../data/AppContext';
import {
  PSATicket,
  TicketPriority,
  TicketStatus
} from '../../types';
import {
  TicketCheck,
  Plus,
  Clock,
  User,
  MessageSquare,
  Sparkles,
  Play,
  DollarSign,
  X,
  Send,
  Laptop,
  ChevronRight,
  Kanban,
  ListFilter
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

  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('list');
  const [showCreateModal, setShowCreateModal] = useState(false);

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

  const getPriorityBadge = (p: TicketPriority) => {
    switch (p) {
      case 'urgent': return <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold text-[10px]">URGENT</span>;
      case 'high': return <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold text-[10px]">HIGH</span>;
      case 'medium': return <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 font-bold text-[10px]">MEDIUM</span>;
      case 'low': return <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-bold text-[10px]">LOW</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
            <TicketCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-slate-100 text-base">PSA Ticket Management Queue</h1>
            <p className="text-slate-400 text-xs">SLA timer tracking, billable hours log & linked RMM diagnostics</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold text-slate-400">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${viewMode === 'list' ? 'bg-slate-800 text-slate-100' : ''}`}
            >
              <ListFilter className="w-3.5 h-3.5" /> List
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${viewMode === 'kanban' ? 'bg-slate-800 text-slate-100' : ''}`}
            >
              <Kanban className="w-3.5 h-3.5" /> Kanban
            </button>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition shadow-md shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>New PSA Ticket</span>
          </button>
        </div>
      </div>

      {/* Main Body: Queue + Selected Ticket Drawer */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: Queue (List View) or Kanban View */}
        {viewMode === 'list' ? (
          <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-3">
            {filteredTickets.map(ticket => {
              const isSelected = ticket.id === selectedTicketId;
              return (
                <div
                  key={ticket.id}
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className={`p-4 rounded-xl border transition cursor-pointer flex flex-col gap-2 ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500/50 shadow-md'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-amber-400 text-xs">{ticket.ticketNumber}</span>
                      {getPriorityBadge(ticket.priority)}
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-semibold uppercase">
                        {ticket.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>SLA: {ticket.slaDueDate}</span>
                    </div>
                  </div>

                  <h3 className="font-bold text-slate-100 text-sm">{ticket.title}</h3>

                  <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                    <span>Client: <strong className="text-slate-200">{ticket.clientName}</strong></span>
                    <span>Assigned: <strong className="text-slate-200">{ticket.assignedTech}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex-1 p-4 overflow-x-auto custom-scrollbar">
            <div className="flex gap-4 min-w-max h-full">
              {(['new', 'in_progress', 'waiting_on_client', 'resolved', 'closed'] as TicketStatus[]).map(status => {
                const statusTickets = filteredTickets.filter(t => t.status === status);
                const statusLabels: Record<TicketStatus, string> = {
                  new: 'New',
                  in_progress: 'In Progress',
                  waiting_on_client: 'Waiting on Client',
                  resolved: 'Resolved',
                  closed: 'Closed'
                };
                return (
                  <div key={status} className="w-72 flex flex-col bg-slate-900/50 rounded-xl border border-slate-800">
                    <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                      <span className="font-bold text-slate-200 text-xs uppercase">{statusLabels[status]}</span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-bold">{statusTickets.length}</span>
                    </div>
                    <div className="flex-1 p-2 space-y-2 overflow-y-auto custom-scrollbar">
                      {statusTickets.map(ticket => {
                        const isSelected = ticket.id === selectedTicketId;
                        return (
                          <div
                            key={ticket.id}
                            onClick={() => setSelectedTicketId(ticket.id)}
                            className={`p-3 rounded-lg border transition cursor-pointer ${
                              isSelected
                                ? 'bg-amber-500/10 border-amber-500/50'
                                : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono font-bold text-amber-400 text-[10px]">{ticket.ticketNumber}</span>
                              {getPriorityBadge(ticket.priority)}
                            </div>
                            <h4 className="font-bold text-slate-100 text-xs line-clamp-2">{ticket.title}</h4>
                            <p className="text-[10px] text-slate-400 mt-1">{ticket.clientName}</p>
                          </div>
                        );
                      })}
                      {statusTickets.length === 0 && (
                        <div className="p-4 text-center text-slate-500 text-[10px]">No tickets</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Right: Selected Ticket Detail & Workbench */}
        {selectedTicket && (
          <div className="w-[500px] bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 overflow-hidden">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-amber-400 text-xs">{selectedTicket.ticketNumber}</span>
                  {getPriorityBadge(selectedTicket.priority)}
                </div>
                <h2 className="font-bold text-slate-100 text-sm mt-1">{selectedTicket.title}</h2>
              </div>
              <button onClick={() => setSelectedTicketId(null)} className="p-1 rounded text-slate-400 hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Status Bar */}
            <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-400 font-bold">Status:</span>
              <select
                value={selectedTicket.status}
                onChange={(e) => updateTicketStatus(selectedTicket.id, e.target.value as TicketStatus)}
                className="bg-slate-900 border border-slate-800 text-amber-400 font-bold p-1.5 rounded-lg outline-none cursor-pointer"
              >
                <option value="new">NEW</option>
                <option value="in_progress">IN PROGRESS</option>
                <option value="waiting_on_client">WAITING ON CLIENT</option>
                <option value="resolved">RESOLVED</option>
                <option value="closed">CLOSED</option>
              </select>

              {selectedTicket.deviceId && (
                <button
                  onClick={() => launchRustDeskSession(selectedTicket.deviceId!)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold hover:bg-emerald-500/20 transition flex items-center gap-1"
                >
                  <Laptop className="w-3.5 h-3.5" /> Remote Desk
                </button>
              )}
            </div>

            {/* Ticket Scroll Content */}
            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-4 text-xs">
              {/* Description Box */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="text-slate-400 font-bold text-[11px]">Ticket Description</div>
                <p className="text-slate-200 leading-relaxed">{selectedTicket.description}</p>
              </div>

              {/* AI Suggested Resolution Box */}
              {selectedTicket.aiSuggestedFix && (
                <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/30 space-y-2">
                  <div className="flex items-center justify-between text-sky-400 font-bold">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" /> Apex AI Root Cause & Remediation Suggestion
                    </span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px] font-medium">{selectedTicket.aiSuggestedFix}</p>
                </div>
              )}

              {/* Comments Timeline */}
              <div className="space-y-3">
                <div className="font-bold text-slate-300">Conversation & Internal Notes</div>
                {selectedTicket.comments.map(c => (
                  <div
                    key={c.id}
                    className={`p-3 rounded-xl border space-y-1 ${
                      c.isInternal
                        ? 'bg-amber-500/5 border-amber-500/20 text-amber-200'
                        : 'bg-slate-950 border-slate-800 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className={c.authorRole === 'ai_copilot' ? 'text-sky-400' : 'text-slate-300'}>{c.author}</span>
                      <span className="text-slate-500">{c.timestamp}</span>
                    </div>
                    <p className="text-xs leading-normal">{c.content}</p>
                  </div>
                ))}
              </div>

              {/* Add Comment Input */}
              <form onSubmit={handleAddComment} className="space-y-2 pt-2 border-t border-slate-800">
                <textarea
                  rows={2}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Type note or client update..."
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs outline-none focus:border-amber-500"
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isInternalComment}
                      onChange={(e) => setIsInternalComment(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-800"
                    />
                    <span>Internal Technician Note</span>
                  </label>
                  <button type="submit" className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center gap-1">
                    <Send className="w-3.5 h-3.5" /> Post Comment
                  </button>
                </div>
              </form>

              {/* Time Tracking Log */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3 pt-3">
                <div className="flex items-center justify-between font-bold text-slate-300">
                  <span className="flex items-center gap-1.5"><DollarSign className="w-4 h-4 text-emerald-400" /> Billable Time Log</span>
                  <span className="text-emerald-400 font-mono">
                    Total: {selectedTicket.timeEntries.reduce((a, b) => a + b.minutes, 0)} mins
                  </span>
                </div>

                <form onSubmit={handleAddTime} className="flex items-center gap-2">
                  <input
                    type="number"
                    value={timeMinutes}
                    onChange={(e) => setTimeMinutes(Number(e.target.value))}
                    className="w-16 p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={timeDesc}
                    onChange={(e) => setTimeDesc(e.target.value)}
                    className="flex-1 p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-100 text-xs"
                  />
                  <button type="submit" className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs">
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
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateTicketSubmit} className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-bold text-slate-100 text-base">Create New PSA Ticket</h2>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Ticket Subject</label>
              <input
                type="text"
                required
                value={ticketTitle}
                onChange={(e) => setTicketTitle(e.target.value)}
                placeholder="e.g. Printer Spooler Failing on Executive Laptop"
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Description</label>
              <textarea
                rows={3}
                value={ticketDesc}
                onChange={(e) => setTicketDesc(e.target.value)}
                placeholder="Detailed client issue report..."
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-400 mb-1">Client Tenant</label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 outline-none"
                >
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">Priority SLA</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TicketPriority)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs"
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
