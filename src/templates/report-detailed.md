# Project Status Report: Detailed
_Generated {{date}}_

---

## {{Area}}

### {{workItem}}

| Field | Value |
|---|---|
| RAG | {{RAG_EMOJI}} {{ragStatus}} |
| Status | {{projectStatus}} |
| Priority | {{priority}} |
| Due Date | {{dueDate}} |
| Staleness | {{daysSinceLastLog}}d |
| Latest Status | {{latestStatus}} |
| Latest Update | **{{latestLogDate}}:** {{latestLogNote}} |
| Open / In Progress | {{openTaskCount}} open / {{inProgressTaskCount}} in progress |
| Stakeholders | {{stakeholders}} |
| Linked JIRAs | {{linkedJiras}} |

{{tasksHeader}}
| {{taskTitle}} | {{taskOwner}} | {{taskDueDate}} | {{taskStatus}} |

---

## Summary

**Portfolio at a Glance**
- Total Projects: {{totalProjects}}
- 🔴 Red: {{redCount}} | 🟡 Amber: {{amberCount}} | 🟢 Green: {{greenCount}}
- Overdue Tasks: {{overdueTaskCount}}
- Stale (14d+): {{staleCount}}
- No Due Date: {{noDueDateCount}}

**By Area**
- {{area}}: {{projectCount}} projects — 🔴 {{areaRed}} 🟡 {{areaAmber}} 🟢 {{areaGreen}}

**Red Projects with Overdue Tasks**
- {{workItem}} — {{overdueTaskCount}} overdue task(s)
