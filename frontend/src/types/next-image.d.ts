// Next generates `next-env.d.ts`, and that file is git-ignored, so on a fresh
// checkout nothing declares the ambient `*.png` module that a static image
// import resolves to. CI typechecks before it builds, which is exactly when
// the generated file does not exist yet — `BrandMark` then fails to compile on
// the runner while it compiles here. Referencing the types directly, from a
// file that is committed, removes that dependency on build order.
/// <reference types="next/image-types/global" />
