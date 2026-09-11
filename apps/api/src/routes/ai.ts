import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import type { AICopilotMessage } from '@openmsp/api-types';

const router = Router();
router.use(authenticate);

// POST /api/v1/ai/chat
router.post('/chat', (req: AuthenticatedRequest, res) => {
  const { message, clientId } = req.body;
  if (!message) {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  const userText = message.toLowerCase();
  let aiResponseText = '';
  let codeSnippet: string | undefined;
  let codeLanguage: 'powershell' | 'bash' | 'json' | 'sql' | undefined;
  let actionableContext: AICopilotMessage['actionableContext'] | undefined;

  // Tool 1: list_tickets / "broken" / "ticket"
  if (userText.includes('ticket') || userText.includes('broken') || userText.includes('issue')) {
    let tickets = Array.from(store.tickets.values());
    if (clientId && clientId !== 'all') {
      tickets = tickets.filter((t) => t.clientId === clientId);
    }
    const openTickets = tickets.filter((t) => t.status !== 'closed');
    if (openTickets.length === 0) {
      aiResponseText = 'All systems healthy. There are currently no open tickets for this client scope.';
    } else {
      const summaryList = openTickets
        .map((t) => `• [${t.ticketNumber}] ${t.title} (${t.priority.toUpperCase()} priority - Status: ${t.status})`)
        .join('\n');
      aiResponseText = `Found ${openTickets.length} active ticket(s):\n\n${summaryList}`;
    }
  }
  // Tool 2: get_device / "device" / "health" / "memory" / "cpu"
  else if (userText.includes('device') || userText.includes('health') || userText.includes('offline') || userText.includes('spooler')) {
    let devices = Array.from(store.devices.values());
    if (clientId && clientId !== 'all') {
      devices = devices.filter((d) => d.clientId === clientId);
    }
    const critical = devices.filter((d) => d.health === 'critical' || d.health === 'warning');
    if (critical.length > 0) {
      const dev = critical[0];
      aiResponseText = `Device ${dev.name} is reporting ${dev.health.toUpperCase()} condition (CPU: ${dev.metrics.cpuUsage}%, RAM: ${dev.metrics.ramUsage}%). Proposed remediation script generated below:`;
      codeSnippet = dev.os === 'windows'
        ? `Restart-Service -Name "Spooler" -Force\nClear-Content "$env:TEMP\\*" -Force -Recurse`
        : `sudo killall -HUP syslogd`;
      codeLanguage = dev.os === 'windows' ? 'powershell' : 'bash';
      actionableContext = {
        type: 'run_remediation',
        targetId: dev.id
      };
    } else {
      aiResponseText = `Analyzed ${devices.length} managed device(s). All endpoints are reporting healthy telemetry with nominal CPU and memory metrics.`;
    }
  }
  // Tool 3: propose_script
  else if (userText.includes('script') || userText.includes('fix') || userText.includes('powershell')) {
    aiResponseText = 'Here is a recommended diagnostics and remediation PowerShell script. Review before executing:';
    codeSnippet = `Get-Service | Where-Object {$_.Status -eq "Stopped" -and $_.StartType -eq "Automatic"}`;
    codeLanguage = 'powershell';
  } else {
    aiResponseText = `I have access to live telemetry, PSA tickets, and automations. You can ask me:\n- "What's broken for this client?"\n- "Show health summary for devices"\n- "Propose a script to clean temp files"`;
  }

  const aiMessage: AICopilotMessage = {
    id: uuidv4(),
    sender: 'ai',
    text: aiResponseText,
    timestamp: new Date().toISOString(),
    codeSnippet,
    codeLanguage,
    actionableContext
  };

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'ai.copilot_query',
    targetType: 'ai_copilot',
    targetId: 'copilot',
    details: { promptLength: message.length },
    ipAddress: req.ip
  });

  res.json(aiMessage);
});

export default router;
