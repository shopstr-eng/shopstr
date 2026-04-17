import { useState, useEffect, useContext, useCallback } from "react";
import { Button, Input, Select, SelectItem, Spinner } from "@heroui/react";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import ProtectedRoute from "@/components/utility-components/protected-route";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
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
    } catch {
      setError("Failed to load API keys.");
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
    } catch {
      setError("Failed to create API key.");
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
    } catch {
      setError("Failed to revoke API key.");
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
      <div className="bg-light-bg dark:bg-dark-bg flex h-full flex-col pt-24">
        <div className="mx-auto w-full px-4 lg:w-1/2 xl:w-2/5">
          <SettingsBreadCrumbs />

          <div className="mb-8 p-4">
            <h2 className="text-light-text dark:text-dark-text mb-2 text-2xl font-bold">
              MCP Connection
            </h2>
            <div className="bg-light-fg dark:bg-dark-fg rounded-lg p-4">
              <div className="mb-3 flex items-start gap-2">
                <InformationCircleIcon className="text-light-text dark:text-dark-text mt-0.5 h-5 w-5 flex-shrink-0" />
                <p className="text-light-text dark:text-dark-text text-sm">
                  Use the endpoint URL below to connect AI agents to Shopstr via
                  the Model Context Protocol (MCP). Include your API key in the{" "}
                  <code className="bg-light-bg dark:bg-dark-bg rounded px-1">
                    Authorization
                  </code>{" "}
                  header as a Bearer token.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <code className="bg-light-bg text-light-text dark:bg-dark-bg dark:text-dark-text flex-1 rounded-lg px-3 py-2 text-sm break-all">
                  {mcpEndpointUrl}
                </code>
                <button
                  onClick={() => handleCopy(mcpEndpointUrl)}
                  className="bg-light-bg dark:bg-dark-bg rounded-lg p-2 transition-colors hover:opacity-70"
                >
                  <ClipboardDocumentIcon className="text-light-text dark:text-dark-text h-5 w-5" />
                </button>
              </div>
              <div className="bg-light-bg dark:bg-dark-bg mt-3 rounded-lg p-3">
                <p className="text-light-text dark:text-dark-text mb-1 text-xs font-bold">
                  Example usage:
                </p>
                <code className="text-light-text dark:text-dark-text block text-xs break-all whitespace-pre-wrap">
                  {`curl ${mcpEndpointUrl} \\
  -H "Authorization: Bearer sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"method": "tools/list"}'`}
                </code>
              </div>
            </div>
          </div>

          {error && (
            <div className="mx-4 mb-4 flex items-center rounded-lg border border-red-400 bg-red-100 p-3 text-red-700">
              <ExclamationCircleIcon className="mr-2 h-5 w-5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="mx-4 mb-4 flex items-center rounded-lg border border-green-400 bg-green-100 p-3 text-green-700">
              <CheckCircleIcon className="mr-2 h-5 w-5" />
              <span className="text-sm">{successMessage}</span>
            </div>
          )}

          {createdKey && (
            <div className="mx-4 mb-6 rounded-lg border border-green-400 bg-green-50 p-4 dark:bg-green-900/20">
              <p className="mb-2 text-sm font-bold text-green-800 dark:text-green-300">
                API key created! Copy it now — it won&apos;t be shown again.{" "}
                <button
                  className="text-blue-500 underline hover:text-blue-700"
                  onClick={() => setShowCreatedKey((prev) => !prev)}
                >
                  {showCreatedKey ? "Hide" : "Show"}
                </button>
              </p>
              <div className="flex items-center gap-2">
                <code
                  className={`bg-light-bg text-light-text dark:bg-dark-bg dark:text-dark-text flex-1 rounded-lg px-3 py-2 font-mono text-sm break-all ${showCreatedKey ? "" : "blur-sm"}`}
                >
                  {createdKey}
                </code>
                <button
                  onClick={() => handleCopy(createdKey)}
                  className="bg-light-bg dark:bg-dark-bg rounded-lg p-2 transition-colors hover:opacity-70"
                >
                  {copied ? (
                    <CheckCircleIcon className="h-5 w-5 text-green-600" />
                  ) : (
                    <ClipboardDocumentIcon className="text-light-text dark:text-dark-text h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="mb-8 px-4">
            <h2 className="text-light-text dark:text-dark-text mb-4 text-2xl font-bold">
              Create API Key
            </h2>
            <div className="bg-light-fg dark:bg-dark-fg space-y-4 rounded-lg p-4">
              <Input
                label="Key Name"
                placeholder="e.g., My AI Agent"
                value={newKeyName}
                onValueChange={setNewKeyName}
                classNames={{
                  label: "text-light-text dark:text-dark-text",
                  input: "text-light-text dark:text-dark-text",
                }}
              />
              <Select
                label="Permissions"
                selectedKeys={[newKeyPermission]}
                onChange={(e) => setNewKeyPermission(e.target.value)}
                classNames={{
                  label: "text-light-text dark:text-dark-text",
                  value: "text-light-text dark:text-dark-text",
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
                className={SHOPSTRBUTTONCLASSNAMES}
                onClick={handleCreate}
                isLoading={isCreating}
                isDisabled={!newKeyName.trim()}
              >
                {isCreating ? "Creating..." : "Generate API Key"}
              </Button>
            </div>
          </div>

          <div className="mb-8 px-4">
            <h2 className="text-light-text dark:text-dark-text mb-4 text-2xl font-bold">
              Your API Keys
            </h2>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : apiKeys.length === 0 ? (
              <p className="text-light-text dark:text-dark-text">
                No API keys created yet.
              </p>
            ) : (
              <div className="space-y-3">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className={`rounded-lg p-4 ${
                      key.is_active
                        ? "bg-light-fg dark:bg-dark-fg"
                        : "bg-light-fg dark:bg-dark-fg opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <KeyIcon className="text-light-text dark:text-dark-text h-5 w-5" />
                          <span className="text-light-text dark:text-dark-text font-bold">
                            {key.name}
                          </span>
                          {!key.is_active && (
                            <span className="rounded-md border border-red-300 bg-red-100 px-2 py-0.5 text-xs text-red-700">
                              Revoked
                            </span>
                          )}
                        </div>
                        <div className="text-light-text dark:text-dark-text mt-2 space-y-1 text-sm">
                          <p>
                            Key:{" "}
                            <code className="bg-light-bg dark:bg-dark-bg rounded px-1">
                              {key.key_prefix}...
                            </code>
                          </p>
                          <p>
                            Permissions:{" "}
                            <span
                              className={`rounded-md border px-2 py-0.5 text-xs font-bold ${
                                key.permissions === "read_write"
                                  ? "border-blue-300 bg-blue-100 text-blue-700"
                                  : "border-gray-300 bg-gray-100 text-gray-700"
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
