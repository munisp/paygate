/**
 * Contacts / Friends (Consumer) - Wave 68
 * Add contacts by phone number, view friend list, send money directly from contacts.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, UserPlus, User, Trash2, Send, Search, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";
import { PaginationControls } from "@/components/ui/pagination-controls";

export default function Contacts() {
  useOnboardingGate();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addNickname, setAddNickname] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.contacts.list.useQuery({ search: search || undefined }, {
    staleTime: 30_000,
    keepPreviousData: true,
  } as any);
  const contacts = (data as any)?.rows ?? data ?? [];
  const CONTACTS_PAGE_SIZE = 15;
  const [contactsPage, setContactsPage] = useState(1);
  const totalContactsPages = Math.max(1, Math.ceil((contacts as any[]).length / CONTACTS_PAGE_SIZE));
  const pagedContacts = (contacts as any[]).slice((contactsPage - 1) * CONTACTS_PAGE_SIZE, contactsPage * CONTACTS_PAGE_SIZE);

  const addContact = trpc.contacts.add.useMutation({
    onSuccess: () => {
      toast.success("Contact added!");
      setAddOpen(false);
      setAddPhone("");
      setAddNickname("");
      utils.contacts.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeContact = trpc.contacts.delete.useMutation({
    onSuccess: () => { toast.success("Contact removed"); utils.contacts.list.invalidate(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  if (!isLoading && !data) {
    return (
      <div className="p-6">
        <BridgeEmptyState
          variant="offline"
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/consumer")}><ArrowLeft className="w-5 h-5" /></Button>
          <h1 className="text-lg font-semibold">Contacts</h1>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <UserPlus className="w-4 h-4 mr-2" />Add
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : !(contacts as any[]).length ? (
        <div className="text-center py-12 text-muted-foreground">
          <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search ? "No contacts found" : "No contacts yet. Add your first contact!"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pagedContacts.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">{((c.nickname ?? c.contactName ?? c.phone ?? "?") as string)[0].toUpperCase()}</span>
                </div>
                <div>
                  <p className="text-sm font-medium">{c.nickname ?? c.contactName ?? "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">{c.phone}</p>
                  {c.isRegistered && <Badge variant="secondary" className="text-[10px] mt-0.5">PayGate User</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {c.isRegistered && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-primary"
                    onClick={() => navigate("/consumer/send")}>
                    <Send className="w-4 h-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                  aria-label="Delete" onClick={() => removeContact.mutate({ id: c.id })}><Trash2/>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {(contacts as any[]).length > CONTACTS_PAGE_SIZE && (
        <PaginationControls
          page={contactsPage}
          totalPages={totalContactsPages}
          onPageChange={setContactsPage}
        />
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Phone Number</Label>
              <Input placeholder="+2348012345678" value={addPhone} onChange={e => setAddPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Nickname (optional)</Label>
              <Input placeholder="e.g. Mum, John" value={addNickname} onChange={e => setAddNickname(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => addContact.mutate({ nickname: addNickname || addPhone, phone: addPhone || undefined })}
              disabled={!addPhone || addContact.isPending}>
              {addContact.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Add Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
