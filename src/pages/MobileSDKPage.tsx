import { useState, useMemo } from "react";
import { Smartphone, Apple, Code2, Copy, Download, Smartphone as Phone, Tablet, Watch, QrCode } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { QRCodeSVG } from "qrcode.react";
import { useAgents } from "@/hooks/use-data";
import { toast } from "sonner";

const SDK_VERSIONS = [
  { platform: "iOS", version: "1.4.2", lang: "Swift 5.9", min: "iOS 15+", icon: Apple, downloads: "12.4k" },
  { platform: "Android", version: "1.4.2", lang: "Kotlin 1.9", min: "API 24+", icon: Smartphone, downloads: "18.7k" },
  { platform: "React Native", version: "1.4.0", lang: "TS", min: "RN 0.72+", icon: Code2, downloads: "8.2k" },
  { platform: "Flutter", version: "1.3.8", lang: "Dart 3.2", min: "Flutter 3.16+", icon: Code2, downloads: "5.1k" },
];

const SNIPPETS: Record<string, string> = {
  iOS: `import NexusAgents

let client = NexusClient(apiKey: "nx_xxx")
let agent = client.agent(id: "agt_001")

let response = try await agent.chat("Olá!")
print(response.text)`,
  Android: `import app.fatorx.nexus.NexusClient

val client = NexusClient(apiKey = "nx_xxx")
val agent = client.agent("agt_001")

val response = agent.chat("Olá!")
println(response.text)`,
  "React Native": `import { NexusClient } from '@fatorx/nexus-rn';

const client = new NexusClient({ apiKey: 'nx_xxx' });
const agent = client.agent('agt_001');

const response = await agent.chat('Olá!');
logger.info(response.text);`,
  Flutter: `import 'package:nexus_agents/nexus_agents.dart';

final client = NexusClient(apiKey: 'nx_xxx');
final agent = client.agent('agt_001');

final response = await agent.chat('Olá!');
print(response.text);`,
};

export default function MobileSDKPage() {
  const [selected, setSelected] = useState("iOS");
  const [agentId, setAgentId] = useState("");
  const [apiKey, setApiKey] = useState("nx_live_xxx");
  const { data: agents = [] } = useAgents();
  const snippet = SNIPPETS[selected];
  const deepLink = useMemo(() => {
    const base = "nexusagents://open";
    const params = new URLSearchParams();
    if (agentId) params.set("agent", agentId);
    if (apiKey && apiKey !== "nx_live_xxx") params.set("key", apiKey);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }, [agentId, apiKey]);

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Mobile SDK"
        description="SDKs nativos para iOS, Android, React Native e Flutter — embarque agentes Nexus em qualquer app mobile."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {SDK_VERSIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.platform}
              onClick={() => setSelected(s.platform)}
              className={`p-4 rounded-lg border-2 text-left transition-all ${selected === s.platform ? "border-primary bg-primary/8 shadow-nexus-md" : "border-border/40 hover:border-border"}`}
            >
              <Icon className="h-6 w-6 mb-2 text-primary" />
              <div className="text-body-sm font-semibold">{s.platform}</div>
              <div className="text-meta text-muted-foreground mt-0.5">v{s.version} · {s.lang}</div>
              <div className="text-meta text-muted-foreground/70 mt-1">{s.min} · {s.downloads} downloads</div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-body-sm flex items-center gap-2"><Code2 className="h-4 w-4" />Quickstart {selected}</CardTitle>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(snippet); toast.success("Snippet copiado"); }}>
              <Copy className="h-3.5 w-3.5 mr-1" />Copiar
            </Button>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="install">
              <TabsList>
                <TabsTrigger value="install">1. Instalação</TabsTrigger>
                <TabsTrigger value="init">2. Init</TabsTrigger>
                <TabsTrigger value="chat">3. Chat</TabsTrigger>
                <TabsTrigger value="streaming">4. Streaming</TabsTrigger>
              </TabsList>
              <TabsContent value="install">
                <pre className="text-meta bg-muted/30 p-4 rounded font-mono overflow-x-auto">
{selected === "iOS" && `# Package.swift
.package(url: "https://github.com/fatorx/nexus-ios", from: "1.4.2")`}
{selected === "Android" && `// build.gradle
implementation("app.fatorx:nexus-agents:1.4.2")`}
{selected === "React Native" && `npm install @fatorx/nexus-rn
# ou
yarn add @fatorx/nexus-rn`}
{selected === "Flutter" && `# pubspec.yaml
dependencies:
  nexus_agents: ^1.3.8`}
                </pre>
              </TabsContent>
              <TabsContent value="init">
                <pre className="text-meta bg-muted/30 p-4 rounded font-mono overflow-x-auto">{snippet}</pre>
              </TabsContent>
              <TabsContent value="chat">
                <pre className="text-meta bg-muted/30 p-4 rounded font-mono overflow-x-auto">{snippet}</pre>
              </TabsContent>
              <TabsContent value="streaming">
                <pre className="text-meta bg-muted/30 p-4 rounded font-mono overflow-x-auto">
{`for await chunk in agent.streamChat("Olá!") {
  print(chunk.delta)
}`}
                </pre>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-body-sm">Recursos suportados</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-meta">
              {[
                { name: "Chat (sync + streaming)", on: true },
                { name: "Voice (mic + speaker)", on: true },
                { name: "Vision (câmera + galeria)", on: true },
                { name: "Tool calls", on: true },
                { name: "Push notifications", on: true },
                { name: "Offline cache", on: true },
                { name: "Biometric auth", on: true },
                { name: "WatchOS / Wear OS", on: false },
              ].map((f) => (
                <div key={f.name} className="flex items-center justify-between">
                  <span>{f.name}</span>
                  <Badge variant={f.on ? "default" : "outline"} className="text-meta">{f.on ? "✓" : "Em breve"}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-body-sm">Form factors</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 rounded-md bg-primary/8"><Phone className="h-5 w-5 mx-auto text-primary" /><div className="text-meta mt-1">Phone</div></div>
              <div className="p-3 rounded-md bg-primary/8"><Tablet className="h-5 w-5 mx-auto text-primary" /><div className="text-meta mt-1">Tablet</div></div>
              <div className="p-3 rounded-md bg-muted/30"><Watch className="h-5 w-5 mx-auto text-muted-foreground" /><div className="text-meta mt-1">Watch</div></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-body-sm flex items-center gap-2"><QrCode className="h-4 w-4" />Deep link + QR Code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-meta">Agente</Label>
                <select
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-body-sm"
                >
                  <option value="">— Selecione —</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.avatar_emoji ?? "🤖"} {a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-meta">API Key</Label>
                <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="mt-1 font-mono text-meta" />
              </div>
              <div className="flex flex-col items-center gap-2 pt-2">
                <div className="p-3 bg-white rounded-md">
                  <QRCodeSVG value={deepLink} size={160} level="M" />
                </div>
                <code className="text-meta text-muted-foreground break-all text-center max-w-full">{deepLink}</code>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => { navigator.clipboard.writeText(deepLink); toast.success("Deep link copiado"); }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />Copiar deep link
                </Button>
              </div>
            </CardContent>
          </Card>

          <Button className="w-full" variant="outline"><Download className="h-4 w-4 mr-2" />Baixar exemplo completo</Button>
        </div>
      </div>
    </div>
  );
}
