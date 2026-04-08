export interface JiraStatus {
  id: string;
  name: string;
  statusCategory?: { name: string };
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { id: string; name: string };
}

export interface JiraCreatedIssue {
  id: string;
  key: string;
  self: string;
}
