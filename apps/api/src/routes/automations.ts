import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../db/store.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import type { SelfHealingRule, AutomationExecutionLog } from '@openmsp/api-types';

const router = Router();
router.use(authenticate);

// GET /api/v1/automations/rules
router.get('/rules', (req, res) => {
  res.json(Array.from(store.automations.values()));
});

// POST /api/v1/automations/rules
router.post('/rules', (req: AuthenticatedRequest, res) => {
  const { name, description, osTarget, triggerType, triggerThreshold, targetServiceName, actionType, scriptContent } = req.body;
  if (!name || !triggerType || !actionType) {
    res.status(400).json({ error: 'name, triggerType, and actionType are required' });
    return;
  }

  const id = `rule-${uuidv4().substring(0, 8)}`;
  const rule: SelfHealingRule = {
    id,
    name,
    description: description || '',
    enabled: true,
    osTarget: osTarget || 'all',
    triggerType,
    triggerThreshold: triggerThreshold ? Number(triggerThreshold) : undefined,
    targetServiceName,
    actionType,
    scriptContent,
    executionsCount: 0,
    successRate: 100
  };

  store.automations.set(id, rule);

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'automation.rule_create',
    targetType: 'automation_rule',
    targetId: id,
    details: { name },
    ipAddress: req.ip
  });

  res.status(201).json(rule);
});

// PATCH /api/v1/automations/rules/:id
router.patch('/rules/:id', (req: AuthenticatedRequest, res) => {
  const ruleId = req.params.id as string;
  const rule = store.automations.get(ruleId);
  if (!rule) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }

  const { enabled, name, description } = req.body;
  if (enabled !== undefined) rule.enabled = enabled;
  if (name !== undefined) rule.name = name;
  if (description !== undefined) rule.description = description;

  store.automations.set(rule.id, rule);
  res.json(rule);
});

// POST /api/v1/automations/rules/:id/dry-run
// Spec: "Dry-run must not mutate live device health. Dry-run only writes a log row."
router.post('/rules/:id/dry-run', (req: AuthenticatedRequest, res) => {
  const ruleId = req.params.id as string;
  const rule = store.automations.get(ruleId);
  if (!rule) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }

  const { deviceId } = req.body;
  const device = deviceId ? store.devices.get(deviceId) : Array.from(store.devices.values())[0];
  const deviceName = device ? device.name : 'Simulated Device';

  const log: AutomationExecutionLog = {
    id: uuidv4(),
    ruleId: rule.id,
    ruleName: rule.name,
    deviceId: device ? device.id : 'sim-001',
    deviceName,
    timestamp: new Date().toISOString(),
    status: 'success',
    details: `[DRY-RUN] Simulation evaluated condition for ${rule.triggerType}. Action '${rule.actionType}' would be triggered. Live device state was NOT mutated.`,
    isDryRun: true
  };

  store.automationLogs.unshift(log);

  store.recordAudit({
    orgId: req.user!.orgId,
    userId: req.user!.id,
    actorName: req.user!.name,
    action: 'automation.dry_run',
    targetType: 'automation_rule',
    targetId: rule.id,
    details: { deviceName },
    ipAddress: req.ip
  });

  res.json({ success: true, log });
});

// GET /api/v1/automations/executions
router.get('/executions', (req, res) => {
  res.json(store.automationLogs);
});

export default router;
