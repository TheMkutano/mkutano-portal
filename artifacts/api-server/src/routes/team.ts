import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { conveningTeamMembersTable, portalUsersTable, tasksTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

const router: IRouter = Router();

// GET /convenings/:id/team
router.get("/convenings/:id/team", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const conveningId = String(req.params.id);

  const members = await db
    .select()
    .from(conveningTeamMembersTable)
    .where(eq(conveningTeamMembersTable.conveningId, conveningId));

  if (members.length === 0) {
    res.json([]);
    return;
  }

  const userIds = members.map((m) => m.userId);
  const users = await db
    .select({ id: portalUsersTable.id, name: portalUsersTable.name, email: portalUsersTable.email })
    .from(portalUsersTable)
    .where(inArray(portalUsersTable.id, userIds));

  const userById = new Map(users.map((u) => [u.id, u]));

  // Workload: tasks assigned to each member in this convening
  const tasks = await db
    .select({
      assigneeUserId: tasksTable.assigneeUserId,
      status:         tasksTable.status,
      dueDate:        tasksTable.dueDate,
    })
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.conveningId, conveningId),
        inArray(tasksTable.assigneeUserId, userIds),
      ),
    );

  const today = new Date().toISOString().slice(0, 10);

  const workloadByUser = new Map<string, { open: number; overdue: number; completed: number; total: number }>();
  for (const t of tasks) {
    if (!t.assigneeUserId) continue;
    if (!workloadByUser.has(t.assigneeUserId)) {
      workloadByUser.set(t.assigneeUserId, { open: 0, overdue: 0, completed: 0, total: 0 });
    }
    const w = workloadByUser.get(t.assigneeUserId)!;
    w.total++;
    if (t.status === "Completed") {
      w.completed++;
    } else {
      w.open++;
      if (t.dueDate && t.dueDate < today) {
        w.overdue++;
      }
    }
  }

  const result = members.map((m) => {
    const user = userById.get(m.userId);
    const wl = workloadByUser.get(m.userId) ?? { open: 0, overdue: 0, completed: 0, total: 0 };
    return {
      id:             m.id,
      conveningId:    m.conveningId,
      userId:         m.userId,
      userName:       user?.name ?? "Unknown",
      userEmail:      user?.email ?? null,
      projectRole:    m.projectRole,
      isLead:         m.isLead,
      openTasks:      wl.open,
      overdueTasks:   wl.overdue,
      completedTasks: wl.completed,
      totalTasks:     wl.total,
    };
  });

  res.json(result);
});

// POST /convenings/:id/team
router.post("/convenings/:id/team", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const conveningId = String(req.params.id);
  const { userId, projectRole, isLead } = req.body;

  if (!userId || !projectRole) {
    res.status(400).json({ error: "userId and projectRole are required" });
    return;
  }

  const [user] = await db
    .select({ id: portalUsersTable.id, name: portalUsersTable.name, email: portalUsersTable.email })
    .from(portalUsersTable)
    .where(eq(portalUsersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [created] = await db
    .insert(conveningTeamMembersTable)
    .values({ conveningId, userId, projectRole, isLead: isLead ?? false })
    .onConflictDoUpdate({
      target: [conveningTeamMembersTable.conveningId, conveningTeamMembersTable.userId],
      set: { projectRole, isLead: isLead ?? false },
    })
    .returning();

  res.status(201).json({
    ...created,
    userName:  user.name,
    userEmail: user.email,
    openTasks: 0, overdueTasks: 0, completedTasks: 0, totalTasks: 0,
  });
});

// DELETE /convenings/:id/team/:userId
router.delete("/convenings/:id/team/:userId", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const conveningId = String(req.params.id);
  const userId      = String(req.params.userId);

  await db
    .delete(conveningTeamMembersTable)
    .where(
      and(
        eq(conveningTeamMembersTable.conveningId, conveningId),
        eq(conveningTeamMembersTable.userId, userId),
      ),
    );

  res.status(204).send();
});

export default router;
