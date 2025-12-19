{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    pre-commit
    nodejs
    nodePackages.npm
    nodePackages.eslint
    nodePackages.prettier
  ];
  
  shellHook = ''
    export PATH="$PWD/node_modules/.bin:$PATH"
  '';
}
