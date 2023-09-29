{ pkgs }: {
    deps = [
		pkgs.nodePackages.prettier
        pkgs.postgresql
        pkgs.nodejs-16_x
    ];
}