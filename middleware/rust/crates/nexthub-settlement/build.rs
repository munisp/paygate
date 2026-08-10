/*!
build.rs — Compile proto/settlement.proto with tonic-build.
Generates:
  - tonic server/client stubs from the service definition
  - FILE_DESCRIPTOR_SET for tonic-reflection (grpcurl support)
*/

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR")?);

    tonic_build::configure()
        .file_descriptor_set_path(out_dir.join("settlement_descriptor.bin"))
        .compile_protos(
            &["proto/settlement.proto"],
            &["proto"],
        )?;

    // Re-run if proto changes
    println!("cargo:rerun-if-changed=proto/settlement.proto");
    Ok(())
}
