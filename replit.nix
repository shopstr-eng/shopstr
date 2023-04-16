{ pkgs }: {
    deps = [
        pkgs.python39Packages.pip
        pkgs.python39Full
        pkgs.nodejs-16_x
        pkgs.cowsay
    ];
}