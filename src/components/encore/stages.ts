import { FileText, BookOpen, Building2, Users, Send } from "lucide-react";

export const STAGES = [
  { key: "deal", name: "Deal", Icon: FileText, line: "Read the won SOW and extract the problem you solved." },
  { key: "playbook", name: "Playbook", Icon: BookOpen, line: "Turn it into signals that look-alike buyers show." },
  { key: "accounts", name: "Accounts", Icon: Building2, line: "Find companies with the same problem, with quoted proof." },
  { key: "people", name: "People", Icon: Users, line: "Map the department and buying committee at each." },
  { key: "outreach", name: "Outreach", Icon: Send, line: "Draft messages you review and approve." },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];
