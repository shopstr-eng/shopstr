/* eslint-disable @next/next/no-img-element */

import { useContext, useEffect, useState } from "react";
import {
  Card,
  CardBody,
  Divider,
  Button,
  CardHeader,
  Spinner,
} from "@heroui/react";
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
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import ProtectedRoute from "@/components/utility-components/protected-route";

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
        moderators: [pubkey], // Add creator as a moderator
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
    <ProtectedRoute>
      <div className="bg-light-bg dark:bg-dark-bg flex h-full flex-col pt-24">
        <div className="mx-auto h-screen w-full lg:w-1/2 lg:pl-4">
          <SettingsBreadCrumbs />

          {communityToEdit ? (
            // Show the Form for Creating or Editing
            <Card>
              <CardBody>
                <h2 className="text-light-text dark:text-dark-text text-2xl font-bold">
                  {communityToEdit === "new"
                    ? "Create Your Community"
                    : `Editing: ${communityToEdit.name}`}
                </h2>
                <p className="text-light-text/80 dark:text-dark-text/80 mb-4">
                  Create a space for your customers to gather and get updates.
                </p>
                <Divider className="my-4" />
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
            // Show the List of Communities
            <Card>
              <CardHeader>
                <div className="flex w-full items-center justify-between">
                  <h2 className="text-light-text dark:text-dark-text text-2xl font-bold">
                    Your Communities
                  </h2>
                  <Button
                    className={SHOPSTRBUTTONCLASSNAMES}
                    onClick={() => setCommunityToEdit("new")}
                  >
                    Create New
                  </Button>
                </div>
              </CardHeader>
              <CardBody>
                {isLoading && myCommunities.length === 0 ? (
                  <Spinner label="Loading your communities..." />
                ) : myCommunities.length > 0 ? (
                  <div className="space-y-2">
                    {myCommunities.map((community) => (
                      <div
                        key={community.id}
                        className="bg-light-fg dark:bg-dark-fg flex items-center justify-between rounded-lg p-3"
                      >
                        <span className="font-semibold">{community.name}</span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => setCommunityToEdit(community)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            color="danger"
                            variant="flat"
                            onClick={() => handleDelete(community.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-light-text/80 dark:text-dark-text/80 text-center">
                    You haven&apos;t created any communities yet.
                  </p>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default CommunityManagementPage;
