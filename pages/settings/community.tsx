/* eslint-disable @next/next/no-img-element */

import React, { useContext, useEffect, useState } from "react";
import {
  Card,
  CardBody,
  Divider,
  Button,
  CardHeader,
  Spinner,
} from "@nextui-org/react";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { CommunityContext } from "@/utils/context/context";
import {
  createOrUpdateCommunity,
  deleteEvent,
  finalizeAndSendNostrEvent,
} from "@/utils/nostr/nostr-helper-functions";
import CreateCommunityForm from "@/components/communities/CreateCommunityForm";
import { Community } from "@/utils/types/types";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

const CommunityManagementPage = () => {
  const { signer, pubkey } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);
  const { communities, isLoading } = useContext(CommunityContext);
  const [myCommunities, setMyCommunities] = useState<Community[]>([]);
  const [communityToEdit, setCommunityToEdit] = useState<
    Community | "new" | null
  >(null);

  useEffect(() => {
    if (pubkey && communities.size > 0) {
      const userCommunities = Array.from(communities.values()).filter(
        (c) => c.pubkey === pubkey
      );
      setMyCommunities(userCommunities);
    }
  }, [pubkey, communities]);

  const handleSave = async (data: {
    name: string;
    description: string;
    image: string;
    d: string;
  }) => {
    if (!signer || !nostr || !pubkey) {
      alert("You must be logged in to create or update a community.");
      return;
    }
    try {
      const communityEvent = await createOrUpdateCommunity(signer, nostr, {
        ...data,
        moderators: [pubkey],
      });

      await finalizeAndSendNostrEvent(signer!, nostr!, communityEvent);
      alert("Community saved! It may take a few moments to appear.");
      setCommunityToEdit(null);
    } catch (error) {
      console.error("Failed to save community", error);
      alert("Failed to save community.");
    }
  };

  const handleDelete = async (communityId: string) => {
    if (!signer || !nostr) return;

    const isConfirmed = window.confirm(
      "Are you sure you want to delete this community? This action cannot be undone."
    );

    if (isConfirmed) {
      try {
        await deleteEvent(nostr, signer, [communityId]);
        alert(
          "Community deletion request sent. It may take a few moments to disappear from relays."
        );
        // Optimistically remove from the local list
        setMyCommunities((prev) => prev.filter((c) => c.id !== communityId));
      } catch (error) {
        console.error("Failed to delete community", error);
        alert("Failed to delete community.");
      }
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-[#111] pt-24 selection:bg-yellow-400 selection:text-black">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

      <div className="relative z-10 mx-auto h-full w-full px-4 lg:w-1/2 lg:pl-4">
        <SettingsBreadCrumbs />

        {communityToEdit ? (
          <Card className="rounded-2xl border border-zinc-800 bg-[#161616] p-4 shadow-none">
            <CardBody>
              <h2 className="text-3xl font-black uppercase tracking-tighter text-white">
                {communityToEdit === "new"
                  ? "Create Your Community"
                  : `Editing: ${communityToEdit.name}`}
              </h2>
              <p className="mb-4 text-zinc-400">
                Create a space for your customers to gather and get updates.
              </p>
              <Divider className="my-4 bg-zinc-800" />
              <CreateCommunityForm
                existingCommunity={
                  communityToEdit === "new" ? null : communityToEdit
                }
                onSave={handleSave}
                onCancel={() => setCommunityToEdit(null)}
              />
            </CardBody>
          </Card>
        ) : (
          <Card className="rounded-2xl border border-zinc-800 bg-[#161616] p-4 shadow-none">
            <CardHeader>
              <div className="flex w-full items-center justify-between">
                <h2 className="text-3xl font-black uppercase tracking-tighter text-white">
                  Your Communities
                </h2>
                <Button
                  className={`${NEO_BTN} h-10 px-6 text-xs`}
                  onClick={() => setCommunityToEdit("new")}
                >
                  Create New
                </Button>
              </div>
            </CardHeader>
            <CardBody>
              {isLoading && myCommunities.length === 0 ? (
                <Spinner color="warning" label="Loading your communities..." />
              ) : myCommunities.length > 0 ? (
                <div className="space-y-2">
                  {myCommunities.map((community) => (
                    <div
                      key={community.id}
                      className="flex items-center justify-between rounded-xl border border-zinc-800 bg-[#111] p-4 transition-all hover:border-zinc-600"
                    >
                      <span className="font-bold uppercase tracking-tight text-white">
                        {community.name}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          className={`${NEO_BTN} h-8 text-xs`}
                          onClick={() => setCommunityToEdit(community)}
                        >
                          Edit
                        </Button>
                        <Button
                          className={`${NEO_BTN} h-8 bg-red-500 text-xs text-white hover:bg-red-400`}
                          onClick={() => handleDelete(community.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center italic text-zinc-500">
                  You haven&apos;t created any communities yet.
                </p>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CommunityManagementPage;
