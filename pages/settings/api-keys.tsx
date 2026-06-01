import { useState, useEffect, useContext, useCallback } from "react";
import { Button, Input, Select, SelectItem, Spinner } from "@heroui/react";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import ProtectedRoute from "@/components/utility-components/protected-route";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";
import { NostrEventTemplate } from "@/utils/nostr/nostr-manager";
import {
  buildApiKeyCreateProof,
  buildApiKeyRevokeProof,
  buildApiKeysListProof,
  buildMcpRequestProofTemplate,
  MCP_SIGNED_EVENT_HEADER,
  normalizeApiKeysPermission,
} from "@/utils/mcp/request-proof";
import {
  ClipboardDocumentIcon,
  KeyIcon,
  TrashIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

const isUserCancelledError = (error: unknown): boolean =>
  error instanceof Error && error.message === "Action cancelled by user";

interface ApiKeyItem {
  id: number;
  key_prefix: string;
  name: string;
  permissions: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

const ApiKeysPage = () => {
  const { pubkey, signer } = useContext(SignerContext);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyPermission, setNewKeyPermission] = useState("read");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showCreatedKey, setShowCreatedKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const signProof = useCallback(
    async (template: NostrEventTemplate) => {
      if (!signer) {
        throw new Error("A Nostr signer is required to manage API keys.");
      }

      return signer.sign(template);
    },
    [signer]
  );

  const fetchKeys = useCallback(async () => {
    if (!pubkey || !signer) return;
    setIsLoading(true);
    setError(null);
    try {
      const signedEvent = await signProof(
        buildMcpRequestProofTemplate(buildApiKeysListProof(pubkey))
      );
      const res = await fetch(`/api/mcp/api-keys?pubkey=${pubkey}`, {
        headers: {
          [MCP_SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
        },
      });
      const data = await res.json();
      if (data.keys) {
        setApiKeys(data.keys);
      } else {
        setError(data.error || "Failed to load API keys.");
      }
    } catch (error) {
      setError(
        isUserCancelledError(error)
          ? "Enter your passphrase to load API keys."
          : "Failed to load API keys."
      );
    } finally {
      setIsLoading(false);
    }
  }, [pubkey, signer, signProof]);

  useEffect(() => {
    if (pubkey && signer) {
      fetchKeys();
    }
  }, [pubkey, signer, fetchKeys]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      setError("Please enter a name for your API key.");
      return;
    }
    if (!pubkey || !signer) {
      setError("Please sign in with a Nostr signer to manage API keys.");
      return;
    }
    setIsCreating(true);
    setError(null);
    setCreatedKey(null);
    setShowCreatedKey(false);
    try {
      const trimmedName = newKeyName.trim();
      const permissions = normalizeApiKeysPermission(newKeyPermission);
      const signedEvent = await signProof(
        buildMcpRequestProofTemplate(
          buildApiKeyCreateProof({
            name: trimmedName,
            permissions,
            pubkey,
          })
        )
      );
      const res = await fetch("/api/mcp/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          permissions,
          pubkey,
          signedEvent,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCreatedKey(data.key);
        setNewKeyName("");
        setNewKeyPermission("read");
        await fetchKeys();
      } else {
        setError(data.error || "Failed to create API key.");
      }
    } catch (error) {
      setError(
        isUserCancelledError(error)
          ? "Enter your passphrase to create an API key."
          : "Failed to create API key."
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (id: number) => {
    if (!pubkey || !signer) {
      setError("Please sign in with a Nostr signer to manage API keys.");
      return;
    }
    setError(null);
    setSuccessMessage(null);
    try {
      const signedEvent = await signProof(
        buildMcpRequestProofTemplate(
          buildApiKeyRevokeProof({
            id,
            pubkey,
          })
        )
      );
      const res = await fetch("/api/mcp/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pubkey, signedEvent }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMessage("API key revoked.");
        await fetchKeys();
      } else {
        setError(data.error || "Failed to revoke API key.");
      }
    } catch (error) {
      setError(
        isUserCancelledError(error)
          ? "Enter your passphrase to revoke this API key."
          : "Failed to revoke API key."
      );
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const mcpEndpointUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/mcp`
      : "/api/mcp";

  return (
    <ProtectedRoute>
      <div className="relative flex min-h-screen flex-col bg-[#111] pt-24 text-white selection:bg-yellow-400 selection:text-white">
        <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_65%,transparent_100%)] bg-[size:24px_24px]" />
        <div className="relative z-10 mx-auto w-full px-4 lg:w-1/2 xl:w-2/5">
          <SettingsBreadCrumbs />

          <div className="mb-8 px-0 py-4">
            <h2 className="mb-4 text-3xl font-black tracking-tight text-white uppercase">
              MCP Connection
            </h2>
            <div className="rounded-xl border border-zinc-800 bg-[#161616] p-4">
              <div className="mb-3 flex items-start gap-2">
                <InformationCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-300" />
                <p className="text-sm leading-6 text-zinc-400">
                  Use the endpoint URL below to connect AI agents to Shopstr via
                  the Model Context Protocol (MCP). Include your API key in the{" "}
                  <code className="rounded border border-zinc-800 bg-[#111] px-1 text-yellow-300">
                    Authorization
                  </code>{" "}
                  header as a Bearer token.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-zinc-800 bg-[#111] px-3 py-2 text-sm break-all text-zinc-300">
                  {mcpEndpointUrl}
                </code>
                <button
                  onClick={() => handleCopy(mcpEndpointUrl)}
                  className="rounded-lg border border-zinc-800 bg-[#111] p-2 transition-colors hover:border-yellow-400"
                >
                  <ClipboardDocumentIcon className="h-5 w-5 text-zinc-300" />
                </button>
              </div>
              <div className="mt-3 rounded-lg border border-zinc-800 bg-[#111] p-3">
                <p className="mb-1 text-xs font-black tracking-widest text-yellow-300 uppercase">
                  Example usage:
                </p>
                <code className="block text-xs break-all whitespace-pre-wrap text-zinc-400">
                  {`curl ${mcpEndpointUrl} \\
  -H "Authorization: Bearer sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"method": "tools/list"}'`}
                </code>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 flex items-center rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-300">
              <ExclamationCircleIcon className="mr-2 h-5 w-5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 flex items-center rounded-lg border border-green-400/40 bg-green-400/10 p-3 text-green-300">
              <CheckCircleIcon className="mr-2 h-5 w-5" />
              <span className="text-sm">{successMessage}</span>
            </div>
          )}

          {createdKey && (
            <div className="mb-6 rounded-xl border border-green-400/40 bg-green-400/10 p-4">
              <p className="mb-2 text-sm font-black text-green-300">
                API key created! Copy it now — it won&apos;t be shown again.{" "}
                <button
                  className="text-yellow-300 underline hover:text-yellow-200"
                  onClick={() => setShowCreatedKey((prev) => !prev)}
                >
                  {showCreatedKey ? "Hide" : "Show"}
                </button>
              </p>
              <div className="flex items-center gap-2">
                <code
                  className={`flex-1 rounded-lg border border-zinc-800 bg-[#111] px-3 py-2 font-mono text-sm break-all text-zinc-300 ${showCreatedKey ? "" : "blur-sm"}`}
                >
                  {createdKey}
                </code>
                <button
                  onClick={() => handleCopy(createdKey)}
                  className="rounded-lg border border-zinc-800 bg-[#111] p-2 transition-colors hover:border-yellow-400"
                >
                  {copied ? (
                    <CheckCircleIcon className="h-5 w-5 text-green-600" />
                  ) : (
                    <ClipboardDocumentIcon className="h-5 w-5 text-zinc-300" />
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="mb-8 px-0">
            <h2 className="mb-4 text-2xl font-black tracking-tight text-white uppercase">
              Create API Key
            </h2>
            <div className="space-y-4 rounded-xl border border-zinc-800 bg-[#161616] p-4">
              <Input
                label="Key Name"
                placeholder="e.g., My AI Agent"
                value={newKeyName}
                onValueChange={setNewKeyName}
                classNames={{
                  label:
                    "text-zinc-400 font-bold uppercase tracking-wider text-xs",
                  input: "text-white",
                }}
              />
              <Select
                label="Permissions"
                selectedKeys={[newKeyPermission]}
                onChange={(e) => setNewKeyPermission(e.target.value)}
                classNames={{
                  label:
                    "text-zinc-400 font-bold uppercase tracking-wider text-xs",
                  value: "text-white",
                }}
              >
                <SelectItem key="read">
                  Read Only — Browse products, profiles, reviews
                </SelectItem>
                <SelectItem key="read_write">
                  Read + Write — Browse and place orders
                </SelectItem>
              </Select>
              <Button
                className={NEO_BTN}
                onClick={handleCreate}
                isLoading={isCreating}
                isDisabled={!newKeyName.trim()}
              >
                {isCreating ? "Creating..." : "Generate API Key"}
              </Button>
            </div>
          </div>

          <div className="mb-8 px-0">
            <h2 className="mb-4 text-2xl font-black tracking-tight text-white uppercase">
              Your API Keys
            </h2>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : apiKeys.length === 0 ? (
              <p className="text-white">No API keys created yet.</p>
            ) : (
              <div className="space-y-3">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className={`rounded-lg p-4 ${
                      key.is_active
                        ? "border border-zinc-800 bg-[#161616]"
                        : "border border-zinc-800 bg-[#161616] opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <KeyIcon className="h-5 w-5 text-zinc-300" />
                          <span className="font-bold text-white">
                            {key.name}
                          </span>
                          {!key.is_active && (
                            <span className="rounded-md border border-red-300 bg-red-100 px-2 py-0.5 text-xs text-red-700">
                              Revoked
                            </span>
                          )}
                        </div>
                        <div className="mt-2 space-y-1 text-sm text-white">
                          <p>
                            Key:{" "}
                            <code className="rounded border border-zinc-800 bg-[#111] px-1 text-yellow-300">
                              {key.key_prefix}...
                            </code>
                          </p>
                          <p>
                            Permissions:{" "}
                            <span
                              className={`rounded-md border px-2 py-0.5 text-xs font-bold ${
                                key.permissions === "read_write"
                                  ? "border-blue-400/40 bg-blue-400/10 text-blue-300"
                                  : "border-zinc-600 bg-[#111] text-zinc-300"
                              }`}
                            >
                              {key.permissions === "read_write"
                                ? "Read + Write"
                                : "Read Only"}
                            </span>
                          </p>
                          <p>Created: {formatDate(key.created_at)}</p>
                          <p>Last used: {formatDate(key.last_used_at)}</p>
                        </div>
                      </div>
                      {key.is_active && (
                        <Button
                          color="danger"
                          variant="light"
                          size="sm"
                          onClick={() => handleRevoke(key.id)}
                        >
                          <TrashIcon className="h-4 w-4" />
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default ApiKeysPage;
