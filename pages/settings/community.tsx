import React, { useContext, useEffect, useState } from "react";
import { Card, CardBody, Divider, Spinner } from "@nextui-org/react";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { CommunityContext } from "@/utils/context/context";
import { createOrUpdateCommunity } from "@/utils/nostr/nostr-helper-functions";
import CreateCommunityForm from "@/components/communities/CreateCommunityForm";
import { Community } from "@/utils/types/types";
// 1. Import the parser function
import { parseCommunityEvent } from "@/utils/parsers/community-parser-functions";

const CommunityManagementPage = () => {
  const { signer, pubkey } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);
  // 2. Get the addCommunity function from context
  const { communities, isLoading, addCommunity } = useContext(CommunityContext);
  const [myCommunity, setMyCommunity] = useState<Community | null>(null);

  useEffect(() => {
    if (!isLoading && pubkey && communities.size > 0) {
      for (const community of communities.values()) {
        if (community.pubkey === pubkey) {
          setMyCommunity(community);
          break;
        }
      }
    }
  }, [pubkey, communities, isLoading]);

  const handleSave = async (data: {
    name: string;
    description: string;
    image: string;
    d: string;
  }) => {
    if (!signer || !nostr || !pubkey) {
      alert("You must be logged in to create a community.");
      return;
    }
    try {
      // 3. Capture the new event after saving
      const newCommunityEvent = await createOrUpdateCommunity(signer, nostr, {
        ...data,
        moderators: [pubkey],
      });

      // 4. Parse the new event and update the context
      if (newCommunityEvent) {
        const updatedCommunityObject = parseCommunityEvent(newCommunityEvent);
        if (updatedCommunityObject) {
          addCommunity(updatedCommunityObject);
        }
      }

      alert("Community saved!");
    } catch (error) {
      console.error("Failed to save community", error);
      alert("Failed to save community.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-light-bg pt-24 dark:bg-dark-bg">
        <Spinner label="Loading Community Info..." />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-light-bg pt-24 dark:bg-dark-bg">
      <div className="mx-auto w-full max-w-3xl px-4">
        <SettingsBreadCrumbs />
        <Card>
          <CardBody>
            <h2 className="text-2xl font-bold text-light-text dark:text-dark-text">
              {myCommunity ? "Edit Your Community" : "Create Your Community"}
            </h2>
            <p className="mb-4 text-light-text/80 dark:text-dark-text/80">
              Create a space for your customers to gather and get updates.
            </p>
            <Divider className="my-4" />
            <CreateCommunityForm
              existingCommunity={myCommunity}
              onSave={handleSave}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default CommunityManagementPage;