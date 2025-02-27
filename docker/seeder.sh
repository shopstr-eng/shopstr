#!/bin/sh

# Start something with some init data

if [ "$SEED" = "" ];
then
    SEED=/seed
fi

if [ "$INIT_SCRIPTS" = "" ];
then
    INIT_SCRIPTS=/init
fi

if [ "$ENTRYPOINT" = "" ];
then
   if [ -f /entrypoint.sh ];
   then
       ENTRYPOINT=/entrypoint.sh
   else
       ENTRYPOINT=/bin/entrypoint.sh
   fi
fi

if [ ! -f /seeded ]; then
  echo "Seeding data volume..."
  cp -rf $SEED/* /$DATA_DIR/
  touch /seeded
else
  echo "Data volume already initialized."
fi

if [ -d $INIT_SCRIPTS ];
then
    for f in $INIT_SCRIPTS/*; do
        if [ -f "$f" ] && [ "${f: -3}" == ".sh" ]; then
            echo "Running $f"
            if [ `which bash` ]; then
                bash $f
            else
                sh $f
            fi
        fi
    done
fi

$ENTRYPOINT "$@"
