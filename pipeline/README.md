# Character pipeline

`build_character.py` generates the two 3D hunters (`male.glb`, `female.glb`) and their textures into `www/assets/hunter/`.

## Source data (CC0)

```
cd pipeline && mkdir -p src && cd src
git clone --depth 1 --filter=blob:none --sparse https://github.com/makehumancommunity/makehuman.git
git -C makehuman sparse-checkout set makehuman/data/3dobjs makehuman/data/eyes makehuman/data/targets makehuman/data/rigs makehuman/data/skins
git clone --depth 1 --filter=blob:none --sparse https://github.com/makehumancommunity/mpfb2.git
git -C mpfb2 sparse-checkout set "src/mpfb/data/mesh_metadata" "src/mpfb/data/textures" "src/mpfb/data/rigs/standard"
```

Or point to existing copies with `MAKEHUMAN_DATA=/path/to/makehuman/data` and `MPFB_DATA=/path/to/mpfb/data`.

## Build

```
pip install numpy pillow
python3 pipeline/build_character.py            # writes www/assets/hunter
python3 pipeline/build_character.py /tmp/out   # or another folder
```

Takes about 10 to 20 seconds. Output per gender: GLB with 53-bone skin, 18 morph targets (evolution, regional muscle, build, face shape, jaw, nose, breathing), body, eyes, 5 tops, 3 bottoms, 2 shoes, 4 accessories, 9 hair styles, 3 beards (male). Plus UV masks for lips, nails, brows, stubble, beards and scalp, a pore normal map, a fabric normal map, hair strand textures and 5 iris colors.

## How garments and hair are made

Every garment, hair style and beard is an offset shell of the body surface clipped along a smooth scalar field. Shell vertices are stored as interpolations of body vertices, so they inherit every morph target and skin weight: when the hunter's chest grows, the shirt grows with it. The body carries per-garment cover masks so skin under clothing is discarded in the shader and cannot poke through.

## Higher quality clothes and hair

Procedural shells are the ceiling of what this generator can do. For better hair and clothing, download the CC0 MakeHuman community asset packs manually from https://static.makehumancommunity.org/assets/assetpacks.html (the download host is blocked from the environment this app was built in), and drop `.mhclo` + `.obj` + textures into `pipeline/extra_assets/`. The pipeline fits every `.mhclo` it finds to the body as an extra `pack_*` mesh with morphs and skinning. Wiring a new pack mesh into the shop is one line in the `CATALOG` list in `www/js/ui.js` plus a slot mapping in `www/js/hunter3d.js`.
