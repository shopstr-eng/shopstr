import { useState, useEffect, useContext, useCallback } from "react";
import {
  Button,
  Input,
  Select,
  SelectItem,
  Spinner,
  Tooltip,
} from "@nextui-org/react";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { FlowStepEditor } from "@/components/settings/flow-step-editor";
import {
  BLUEBUTTONCLASSNAMES,
  DANGERBUTTONCLASSNAMES,
  PRIMARYBUTTONCLASSNAMES,
  BLACKBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import {
  PlusIcon,
  TrashIcon,
  PlayIcon,
  PauseIcon,
  PencilIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  ArrowLeftIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

interface FlowStep {
  id?: number;
  step_order: number;
  subject: string;
  body_html: string;
  delay_hours: number;
}

interface EmailFlow {
  id: number;
  seller_pubkey: string;
  name: string;
  flow_type: string;
  status: string;
  from_name: string | null;
  reply_to: string | null;
  created_at: string;
  updated_at: string;
}

const FLOW_TYPE_LABELS: Record<string, string> = {
  welcome_series: "Welcome Series",
  abandoned_cart: "Abandoned Cart",
  post_purchase: "Post-Purchase",
  winback: "Win-Back",
};

const FLOW_TYPE_DESCRIPTIONS: Record<string, string> = {
  welcome_series:
    "Greet first-time buyers with a series of emails introducing your shop",
  abandoned_cart:
    "Remind customers who left items in their cart to complete their purchase",
  post_purchase:
    "Follow up after a purchase with tips, thank yous, and review requests",
  winback: "Re-engage customers who haven't purchased in a while",
};

function formatDelayHours(hours: number): string {
  if (hours === 0) return "Immediately";
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} after`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (remainingHours === 0) return `${days} day${days !== 1 ? "s" : ""} after`;
  return `${days}d ${remainingHours}h after`;
}

const EmailFlowsPage = () => {
  const { pubkey, isLoggedIn } = useContext(SignerContext);
  const [flows, setFlows] = useState<EmailFlow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowType, setNewFlowType] = useState("post_purchase");
  const [isCreating, setIsCreating] = useState(false);

  const [editingFlow, setEditingFlow] = useState<EmailFlow | null>(null);
  const [editingSteps, setEditingSteps] = useState<FlowStep[]>([]);
  const [isLoadingSteps, setIsLoadingSteps] = useState(false);
  const [isSavingSteps, setIsSavingSteps] = useState(false);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [editFromName, setEditFromName] = useState("");
  const [editReplyTo, setEditReplyTo] = useState("");

  const fetchFlows = useCallback(async () => {
    if (!pubkey) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/email/flows?seller_pubkey=${pubkey}`);
      const data = await res.json();
      if (data.flows) {
        setFlows(data.flows);
      }
    } catch {
      setError("Failed to load email flows.");
    } finally {
      setIsLoading(false);
    }
  }, [pubkey]);

  useEffect(() => {
    if (pubkey) {
      fetchFlows();
    }
  }, [pubkey, fetchFlows]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleCreate = async () => {
    if (!newFlowName.trim()) {
      setError("Please enter a name for your email flow.");
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/email/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seller_pubkey: pubkey,
          name: newFlowName.trim(),
          flow_type: newFlowType,
          use_defaults: true,
        }),
      });
      const data = await res.json();
      if (data.flow) {
        setSuccessMessage(
          `"${data.flow.name}" flow created with default email templates!`
        );
        setNewFlowName("");
        setShowCreateForm(false);
        await fetchFlows();
      } else {
        setError(data.error || "Failed to create flow.");
      }
    } catch {
      setError("Failed to create flow.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggle = async (flow: EmailFlow) => {
    setError(null);
    try {
      const res = await fetch(`/api/email/flows/${flow.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seller_pubkey: pubkey }),
      });
      const data = await res.json();
      if (data.flow) {
        setSuccessMessage(
          `"${flow.name}" is now ${
            data.flow.status === "active" ? "active" : "paused"
          }.`
        );
        await fetchFlows();
      } else {
        setError(data.error || "Failed to toggle flow.");
      }
    } catch {
      setError("Failed to toggle flow status.");
    }
  };

  const handleDelete = async (flow: EmailFlow) => {
    setError(null);
    try {
      const res = await fetch(
        `/api/email/flows/${flow.id}?seller_pubkey=${pubkey}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) {
        setSuccessMessage(`"${flow.name}" deleted.`);
        if (editingFlow?.id === flow.id) {
          setEditingFlow(null);
          setEditingSteps([]);
        }
        await fetchFlows();
      } else {
        setError(data.error || "Failed to delete flow.");
      }
    } catch {
      setError("Failed to delete flow.");
    }
  };

  const handleEditFlow = async (flow: EmailFlow) => {
    setEditingFlow(flow);
    setEditFromName(flow.from_name || "");
    setEditReplyTo(flow.reply_to || "");
    setIsLoadingSteps(true);
    setExpandedStep(null);
    try {
      const res = await fetch(
        `/api/email/flows/${flow.id}/steps?seller_pubkey=${pubkey}`
      );
      const data = await res.json();
      if (data.steps) {
        setEditingSteps(data.steps);
      }
    } catch {
      setError("Failed to load flow steps.");
    } finally {
      setIsLoadingSteps(false);
    }
  };

  const handleSaveSteps = async () => {
    if (!editingFlow) return;
    setIsSavingSteps(true);
    setError(null);
    try {
      await fetch(`/api/email/flows/${editingFlow.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seller_pubkey: pubkey,
          from_name: editFromName.trim() || null,
          reply_to: editReplyTo.trim() || null,
        }),
      });

      for (const step of editingSteps) {
        if (step.id) {
          await fetch(`/api/email/flows/${editingFlow.id}/steps/${step.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              seller_pubkey: pubkey,
              subject: step.subject,
              body_html: step.body_html,
              delay_hours: step.delay_hours,
              step_order: step.step_order,
            }),
          });
        } else {
          await fetch(`/api/email/flows/${editingFlow.id}/steps`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              seller_pubkey: pubkey,
              subject: step.subject,
              body_html: step.body_html,
              delay_hours: step.delay_hours,
              step_order: step.step_order,
            }),
          });
        }
      }
      setSuccessMessage("Flow saved!");
      await fetchFlows();
      const refreshedFlowRes = await fetch(
        `/api/email/flows/${editingFlow.id}?seller_pubkey=${pubkey}`
      );
      const refreshedFlowData = await refreshedFlowRes.json();
      if (refreshedFlowData.flow) {
        await handleEditFlow(refreshedFlowData.flow);
      }
    } catch {
      setError("Failed to save flow.");
    } finally {
      setIsSavingSteps(false);
    }
  };

  const handleDeleteStep = async (step: FlowStep, index: number) => {
    if (!editingFlow) return;
    if (step.id) {
      try {
        await fetch(
          `/api/email/flows/${editingFlow.id}/steps/${step.id}?seller_pubkey=${pubkey}`,
          { method: "DELETE" }
        );
        setSuccessMessage("Step removed.");
        await handleEditFlow(editingFlow);
      } catch {
        setError("Failed to delete step.");
      }
    } else {
      const updated = editingSteps.filter((_, i) => i !== index);
      setEditingSteps(updated);
    }
  };

  const addNewStep = () => {
    const maxOrder = editingSteps.reduce(
      (max, s) => Math.max(max, s.step_order),
      0
    );
    const lastDelay =
      editingSteps.length > 0
        ? editingSteps[editingSteps.length - 1].delay_hours
        : 0;
    setEditingSteps([
      ...editingSteps,
      {
        step_order: maxOrder + 1,
        subject: "",
        body_html: "",
        delay_hours: lastDelay + 24,
      },
    ]);
    setExpandedStep(editingSteps.length);
  };

  const updateStep = (
    index: number,
    field: keyof FlowStep,
    value: string | number
  ) => {
    const updated = [...editingSteps];
    (updated[index] as any)[field] = value;
    setEditingSteps(updated);
  };

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen flex-col bg-white pb-20 pt-24">
        <div className="mx-auto w-full px-4 lg:w-1/2 xl:w-2/5">
          <SettingsBreadCrumbs />
          <div className="mt-8 rounded-md border-2 border-black bg-yellow-50 p-6 shadow-neo">
            <p className="text-center text-lg font-bold text-black">
              Please sign in to manage email flows.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (editingFlow) {
    return (
      <div className="flex min-h-screen flex-col bg-white pb-20 pt-24">
        <div className="mx-auto w-full px-4 lg:w-2/3 xl:w-1/2">
          <SettingsBreadCrumbs />

          <button
            onClick={() => {
              setEditingFlow(null);
              setEditingSteps([]);
            }}
            className="mb-4 flex items-center gap-1 text-sm font-bold text-gray-600 hover:text-black"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to flows
          </button>

          {error && (
            <div className="mb-4 flex items-center rounded-md border-2 border-black bg-red-100 p-3 text-red-700 shadow-neo">
              <ExclamationCircleIcon className="mr-2 h-5 w-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 flex items-center rounded-md border-2 border-black bg-green-100 p-3 text-green-700 shadow-neo">
              <CheckCircleIcon className="mr-2 h-5 w-5 flex-shrink-0" />
              <span className="text-sm">{successMessage}</span>
            </div>
          )}

          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-black">
                {editingFlow.name}
              </h2>
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded-md border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">
                  {FLOW_TYPE_LABELS[editingFlow.flow_type] ||
                    editingFlow.flow_type}
                </span>
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs font-bold ${
                    editingFlow.status === "active"
                      ? "border-green-300 bg-green-100 text-green-700"
                      : editingFlow.status === "paused"
                        ? "border-yellow-300 bg-yellow-100 text-yellow-700"
                        : "border-gray-300 bg-gray-100 text-gray-700"
                  }`}
                >
                  {editingFlow.status}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                className={BLACKBUTTONCLASSNAMES}
                size="sm"
                onClick={addNewStep}
              >
                <PlusIcon className="h-4 w-4" />
                Add Step
              </Button>
            </div>
          </div>

          <div className="mb-4 rounded-md border-2 border-black bg-white p-4">
            <p className="mb-3 text-sm font-bold text-black">Sender Settings</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                label="From Name"
                value={editFromName}
                onValueChange={setEditFromName}
                placeholder="e.g., Fresh Farm Dairy"
                description="Display name recipients see (optional)"
                classNames={{
                  label: "text-black text-xs",
                  input: "!text-black",
                  inputWrapper:
                    "rounded-md border-2 border-black bg-white shadow-none data-[hover=true]:bg-white data-[focus=true]:bg-white group-data-[focus=true]:bg-white group-data-[focus=true]:border-black",
                }}
              />
              <Input
                label="Reply-To Email"
                value={editReplyTo}
                onValueChange={setEditReplyTo}
                placeholder="e.g., hello@yourfarm.com"
                description="Where replies go (optional)"
                classNames={{
                  label: "text-black text-xs",
                  input: "!text-black",
                  inputWrapper:
                    "rounded-md border-2 border-black bg-white shadow-none data-[hover=true]:bg-white data-[focus=true]:bg-white group-data-[focus=true]:bg-white group-data-[focus=true]:border-black",
                }}
              />
            </div>
          </div>

          <div className="mb-4 flex items-start gap-2 rounded-md border-2 border-black bg-blue-50 p-3">
            <InformationCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
            <div className="text-sm text-blue-800">
              <p className="font-bold">Merge tags you can use:</p>
              <p className="mt-1">
                <code className="rounded bg-blue-100 px-1">
                  {"{{buyer_name}}"}
                </code>{" "}
                <code className="rounded bg-blue-100 px-1">
                  {"{{shop_name}}"}
                </code>{" "}
                <code className="rounded bg-blue-100 px-1">
                  {"{{product_title}}"}
                </code>{" "}
                <code className="rounded bg-blue-100 px-1">
                  {"{{order_id}}"}
                </code>{" "}
                <code className="rounded bg-blue-100 px-1">
                  {"{{shop_url}}"}
                </code>
              </p>
            </div>
          </div>

          {isLoadingSteps ? (
            <div className="flex justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : editingSteps.length === 0 ? (
            <div className="rounded-md border-2 border-dashed border-gray-300 p-8 text-center">
              <EnvelopeIcon className="mx-auto mb-3 h-10 w-10 text-gray-400" />
              <p className="mb-2 font-bold text-gray-600">No steps yet</p>
              <p className="mb-4 text-sm text-gray-500">
                Add your first email step to start building this flow.
              </p>
              <Button className={BLUEBUTTONCLASSNAMES} onClick={addNewStep}>
                <PlusIcon className="h-4 w-4" />
                Add First Step
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {editingSteps
                .sort((a, b) => a.step_order - b.step_order)
                .map((step, index) => (
                  <div
                    key={step.id || `new-${index}`}
                    className="rounded-md border-2 border-black bg-white shadow-neo"
                  >
                    <button
                      onClick={() =>
                        setExpandedStep(expandedStep === index ? null : index)
                      }
                      className="flex w-full items-center justify-between p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-black bg-primary-blue text-sm font-bold text-white">
                          {step.step_order}
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-black">
                            {step.subject || "(No subject)"}
                          </p>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <ClockIcon className="h-3 w-3" />
                            {formatDelayHours(step.delay_hours)}
                            {index > 0 && " previous step"}
                            {index === 0 && " enrollment"}
                          </div>
                        </div>
                      </div>
                      {expandedStep === index ? (
                        <ChevronUpIcon className="h-5 w-5 text-gray-500" />
                      ) : (
                        <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                      )}
                    </button>

                    {expandedStep === index && (
                      <div className="border-t-2 border-black p-4">
                        <div className="space-y-4">
                          <Input
                            label="Subject Line"
                            value={step.subject}
                            onValueChange={(v) =>
                              updateStep(index, "subject", v)
                            }
                            placeholder="e.g., Welcome to {{shop_name}}!"
                            classNames={{
                              label: "text-black",
                              input: "!text-black",
                              inputWrapper:
                                "rounded-md border-2 border-black bg-white shadow-none data-[hover=true]:bg-white data-[focus=true]:bg-white group-data-[focus=true]:bg-white group-data-[focus=true]:border-black",
                            }}
                          />
                          <div>
                            <p className="mb-1 text-sm font-bold text-black">
                              Email Body
                            </p>
                            <FlowStepEditor
                              value={step.body_html}
                              onChange={(v) =>
                                updateStep(index, "body_html", v)
                              }
                            />
                          </div>
                          <div className="flex items-end gap-4">
                            <Input
                              label="Delay (hours)"
                              type="number"
                              min={0}
                              value={String(step.delay_hours)}
                              onValueChange={(v) =>
                                updateStep(
                                  index,
                                  "delay_hours",
                                  parseInt(v) || 0
                                )
                              }
                              description={formatDelayHours(step.delay_hours)}
                              classNames={{
                                base: "max-w-[200px]",
                                label: "text-black",
                                input: "!text-black",
                                inputWrapper:
                                  "rounded-md border-2 border-black bg-white shadow-none data-[hover=true]:bg-white data-[focus=true]:bg-white group-data-[focus=true]:bg-white group-data-[focus=true]:border-black",
                              }}
                            />
                            <Button
                              className={DANGERBUTTONCLASSNAMES}
                              size="sm"
                              onClick={() => handleDeleteStep(step, index)}
                            >
                              <TrashIcon className="h-4 w-4" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {editingSteps.length > 0 && (
            <div className="mt-6 flex justify-end">
              <Button
                className={BLUEBUTTONCLASSNAMES}
                onClick={handleSaveSteps}
                isLoading={isSavingSteps}
              >
                {isSavingSteps ? "Saving..." : "Save All Steps"}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white pb-20 pt-24">
      <div className="mx-auto w-full px-4 lg:w-1/2 xl:w-2/5">
        <SettingsBreadCrumbs />

        {error && (
          <div className="mb-4 flex items-center rounded-md border-2 border-black bg-red-100 p-3 text-red-700 shadow-neo">
            <ExclamationCircleIcon className="mr-2 h-5 w-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 flex items-center rounded-md border-2 border-black bg-green-100 p-3 text-green-700 shadow-neo">
            <CheckCircleIcon className="mr-2 h-5 w-5 flex-shrink-0" />
            <span className="text-sm">{successMessage}</span>
          </div>
        )}

        <div className="mb-6 flex items-start gap-2 rounded-md border-2 border-black bg-gray-50 p-4 shadow-neo">
          <InformationCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-600" />
          <div className="text-sm text-gray-700">
            <p>
              Email flows are automated email sequences sent to your customers
              at timed intervals. Create flows to welcome new buyers, recover
              abandoned carts, follow up after purchases, or re-engage inactive
              customers.
            </p>
          </div>
        </div>

        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-black">Your Flows</h2>
            <Button
              className={BLACKBUTTONCLASSNAMES}
              onClick={() => setShowCreateForm(!showCreateForm)}
            >
              <PlusIcon className="h-4 w-4" />
              New Flow
            </Button>
          </div>

          {showCreateForm && (
            <div className="mb-6 space-y-4 rounded-md border-2 border-black bg-white p-4 shadow-neo">
              <h3 className="text-lg font-bold text-black">
                Create Email Flow
              </h3>
              <Input
                label="Flow Name"
                placeholder="e.g., My Welcome Emails"
                value={newFlowName}
                onValueChange={setNewFlowName}
                classNames={{
                  label: "text-black",
                  input: "!text-black",
                  inputWrapper:
                    "rounded-md border-2 border-black bg-white shadow-none data-[hover=true]:bg-white data-[focus=true]:bg-white group-data-[focus=true]:bg-white group-data-[focus=true]:border-black",
                }}
              />
              <Select
                label="Flow Type"
                selectedKeys={[newFlowType]}
                onChange={(e) => setNewFlowType(e.target.value)}
                classNames={{
                  trigger:
                    "rounded-md border-2 border-black bg-white shadow-none data-[hover=true]:bg-white",
                  label: "text-black",
                  value: "text-black",
                }}
              >
                {Object.entries(FLOW_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </Select>
              {newFlowType && (
                <p className="text-sm text-gray-500">
                  {FLOW_TYPE_DESCRIPTIONS[newFlowType]}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  className={BLUEBUTTONCLASSNAMES}
                  onClick={handleCreate}
                  isLoading={isCreating}
                  isDisabled={!newFlowName.trim()}
                >
                  {isCreating ? "Creating..." : "Create with Default Templates"}
                </Button>
                <Button
                  className={WHITEBUTTONCLASSNAMES}
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : flows.length === 0 ? (
            <div className="rounded-md border-2 border-dashed border-gray-300 p-8 text-center">
              <EnvelopeIcon className="mx-auto mb-3 h-10 w-10 text-gray-400" />
              <p className="mb-2 font-bold text-gray-600">No email flows yet</p>
              <p className="mb-4 text-sm text-gray-500">
                Create your first flow to start sending automated emails to your
                customers.
              </p>
              <Button
                className={PRIMARYBUTTONCLASSNAMES}
                onClick={() => setShowCreateForm(true)}
              >
                <PlusIcon className="h-4 w-4" />
                Create Your First Flow
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {flows.map((flow) => (
                <div
                  key={flow.id}
                  className="rounded-md border-2 border-black bg-white p-4 shadow-neo"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <EnvelopeIcon className="h-5 w-5 text-black" />
                        <span className="font-bold text-black">
                          {flow.name}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">
                          {FLOW_TYPE_LABELS[flow.flow_type] || flow.flow_type}
                        </span>
                        <span
                          className={`rounded-md border px-2 py-0.5 text-xs font-bold ${
                            flow.status === "active"
                              ? "border-green-300 bg-green-100 text-green-700"
                              : flow.status === "paused"
                                ? "border-yellow-300 bg-yellow-100 text-yellow-700"
                                : "border-gray-300 bg-gray-100 text-gray-700"
                          }`}
                        >
                          {flow.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Created{" "}
                        {new Date(flow.created_at).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric", year: "numeric" }
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Tooltip content="Edit steps">
                        <Button
                          className={WHITEBUTTONCLASSNAMES}
                          size="sm"
                          onClick={() => handleEditFlow(flow)}
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                      <Tooltip
                        content={
                          flow.status === "active" ? "Pause" : "Activate"
                        }
                      >
                        <Button
                          className={
                            flow.status === "active"
                              ? PRIMARYBUTTONCLASSNAMES
                              : BLUEBUTTONCLASSNAMES
                          }
                          size="sm"
                          onClick={() => handleToggle(flow)}
                        >
                          {flow.status === "active" ? (
                            <PauseIcon className="h-4 w-4" />
                          ) : (
                            <PlayIcon className="h-4 w-4" />
                          )}
                        </Button>
                      </Tooltip>
                      <Tooltip content="Delete">
                        <Button
                          className={DANGERBUTTONCLASSNAMES}
                          size="sm"
                          onClick={() => handleDelete(flow)}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailFlowsPage;
