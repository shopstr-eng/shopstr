#!/bin/bash

LABEL="com.docker.compose.project=${COMPOSE_PROJECT_NAME}"
CONTAINER_NAME="shopstr-cron"
if [ -n "$CRON_CONTAINER_NAME" ]; then
    CONTAINER_NAME="$CRON_CONTAINER_NAME"
fi

echo "Starting live update script for $COMPOSE_PROJECT_NAME..."
echo "Label: $LABEL"
echo "Cron Container Name: $CONTAINER_NAME"

# Initialize an array to track seen container names
SEEN_CONTAINERS=()

while true; do
    # Fetch all running containers with the given label
    NEW_CONTAINERS=$(docker ps -a --filter "label=$LABEL" --filter "status=running" --format "{{.ID}} {{.Names}}")

    if [ -z "$NEW_CONTAINERS" ]; then
        echo "No running containers found with label $LABEL."
        sleep 10
        continue
    fi

    HEALTHY_CONTAINERS=()
    while read -r container_id container_name; do
        # Check if this container has already been seen
        if [[ " ${SEEN_CONTAINERS[@]} " =~ " $container_name " ]]; then
            continue
        fi

        # Check if the container is healthy
        health_status=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no health check{{end}}' "$container_id" 2>/dev/null || echo "unknown")
        if [ "$health_status" == "healthy" ] || [ "$health_status" == "no health check" ]; then
            echo "Container ID: $container_id, Name: $container_name, Status: $health_status"
            HEALTHY_CONTAINERS+=("$container_name")
            SEEN_CONTAINERS+=("$container_name")
        fi
    done <<< "$NEW_CONTAINERS"

    if [ ${#HEALTHY_CONTAINERS[@]} -gt 0 ]; then
        echo "New healthy containers found: ${HEALTHY_CONTAINERS[@]}"

        # Restart the cron container
        if docker ps --format "{{.Names}}" | grep -q "^$CONTAINER_NAME$"; then
            echo "Restarting $CONTAINER_NAME..."
            docker restart "$CONTAINER_NAME"
        else
            echo "Error: Cron container $CONTAINER_NAME not found or not running."
        fi
    fi

    # Wait for 10 seconds before checking again
    sleep 10
done
