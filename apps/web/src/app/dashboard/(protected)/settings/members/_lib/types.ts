export type Member = {
  id: string;
  role: string;
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
};

export type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
};

export type FullOrganization = {
  members: Member[];
  invitations: Invitation[];
};
