import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Phone, TreePine, Users, Activity, ChevronRight } from "lucide-react";

export default function UssdMenuBuilder() {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [testPhone, setTestPhone] = useState("+2348012345678");
  const [testInput, setTestInput] = useState("");
  const [sessionId] = useState(`test_${Date.now()}`);
  const [sessionLog, setSessionLog] = useState<string[]>([]);

  const [newMenu, setNewMenu] = useState({
    menuCode: "",
    title: "",
    parentId: undefined as number | undefined,
    actionType: "menu" as any,
    sortOrder: 0,
  });

  const { data: menuData, refetch } = trpc.wave31.ussdMenuBuilder.getMenuTree.useQuery();
  const { data: sessionsData } = trpc.wave31.ussdMenuBuilder.getSessions.useQuery({ status: "active" });

  const createMenu = trpc.wave31.ussdMenuBuilder.createMenu.useMutation({
    onSuccess: () => {
      toast.success("Menu item created");
      refetch();
      setShowAddMenu(false);
      setNewMenu({ menuCode: "", title: "", parentId: undefined, actionType: "menu", sortOrder: 0 });
    },
    onError: () => toast.error("Failed to create menu item"),
  });

  const processSession = trpc.wave31.ussdMenuBuilder.processSession.useMutation({
    onSuccess: (data) => {
      setSessionLog(prev => [...prev, `> ${testInput || "(dial)"}`, data.response]);
      setTestInput("");
    },
  });

  const toggleMenu = trpc.wave31.ussdMenuBuilder.updateMenu.useMutation({
    onSuccess: () => refetch(),
  });

  const menus = (menuData as any)?.menus ?? [];
  const sessions = (sessionsData as any)?.sessions ?? [];

  const rootMenus = menus.filter((m: any) => !m.parent_id);
  const childMenus = menus.filter((m: any) => m.parent_id);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">USSD Menu Builder</h1>
          <p className="text-muted-foreground">Configure USSD menu tree for *737# and other service codes</p>
        </div>
        <Dialog open={showAddMenu} onOpenChange={setShowAddMenu}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" />Add Menu Item</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add USSD Menu Item</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Menu Code</Label>
                  <Input placeholder="e.g. SEND_INTL" value={newMenu.menuCode} onChange={e => setNewMenu(p => ({ ...p, menuCode: e.target.value }))} />
                </div>
                <div>
                  <Label>Sort Order</Label>
                  <Input type="number" value={newMenu.sortOrder} onChange={e => setNewMenu(p => ({ ...p, sortOrder: parseInt(e.target.value) }))} />
                </div>
              </div>
              <div>
                <Label>Display Title</Label>
                <Input placeholder="e.g. 5. International Transfer" value={newMenu.title} onChange={e => setNewMenu(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div>
                <Label>Parent Menu</Label>
                <Select onValueChange={v => setNewMenu(p => ({ ...p, parentId: v === "root" ? undefined : parseInt(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Root (top-level)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="root">Root (top-level)</SelectItem>
                    {rootMenus.map((m: any) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.menu_code} — {m.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Action Type</Label>
                <Select value={newMenu.actionType} onValueChange={v => setNewMenu(p => ({ ...p, actionType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['menu', 'balance_check', 'send_to_account', 'send_to_saved', 'airtime_self', 'airtime_other', 'bill_electricity', 'bill_cable', 'statement', 'custom'].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={() => createMenu.mutate(newMenu)} disabled={!newMenu.menuCode || !newMenu.title}>
                Create Menu Item
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Menu Tree */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><TreePine className="h-4 w-4" />Menu Tree</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {menus.map((menu: any) => (
                    <TableRow key={menu.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {menu.parent_id && <ChevronRight className="h-3 w-3 text-muted-foreground ml-2" />}
                          <code className="text-xs bg-muted px-1 rounded">{menu.menu_code}</code>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{menu.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{menu.action_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${menu.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {menu.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => toggleMenu.mutate({ id: menu.id, isActive: !menu.is_active })}>
                          {menu.is_active ? 'Disable' : 'Enable'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Active Sessions */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />Active Sessions ({sessions.length})</CardTitle></CardHeader>
            <CardContent>
              {sessions.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No active sessions</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Session ID</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Current Menu</TableHead>
                      <TableHead>Steps</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((s: any) => (
                      <TableRow key={s.session_id}>
                        <TableCell className="font-mono text-xs">{s.session_id}</TableCell>
                        <TableCell>{s.phone_number}</TableCell>
                        <TableCell>{s.current_menu_title ?? `Menu #${s.current_menu_id}`}</TableCell>
                        <TableCell>{s.step_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* USSD Simulator */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Phone className="h-4 w-4" />USSD Simulator</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Phone Number</Label>
              <Input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="+2348012345678" />
            </div>

            {/* Session Log */}
            <div className="bg-black text-green-400 font-mono text-xs p-3 rounded-lg min-h-[200px] max-h-[300px] overflow-y-auto">
              {sessionLog.length === 0 ? (
                <p className="text-gray-500">Dial *737# to start a session...</p>
              ) : sessionLog.map((line, i) => (
                <div key={i} className={line.startsWith('>') ? 'text-yellow-400' : 'text-green-400'}>{line}</div>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={testInput}
                onChange={e => setTestInput(e.target.value)}
                placeholder="Enter selection (1, 2, 3...)"
                onKeyDown={e => e.key === 'Enter' && processSession.mutate({ sessionId, phoneNumber: testPhone, input: testInput, serviceCode: '*737#' })}
              />
              <Button onClick={() => processSession.mutate({ sessionId, phoneNumber: testPhone, input: testInput, serviceCode: '*737#' })}>
                Send
              </Button>
            </div>

            <Button variant="outline" className="w-full" onClick={() => {
              setSessionLog([]);
              processSession.mutate({ sessionId: `test_${Date.now()}`, phoneNumber: testPhone, input: '', serviceCode: '*737#' });
            }}>
              Dial *737# (New Session)
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
