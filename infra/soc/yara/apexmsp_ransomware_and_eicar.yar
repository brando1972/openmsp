/*
   ApexMSP YARA-X Ruleset (infra/soc/yara/apexmsp_ransomware_and_eicar.yar)
   Compatible with YARA-X (`yr scan`) and standard YARA.
   Covers:
     1. EICAR Standard Antivirus Test File (68-byte and 67-byte variants)
     2. ApexMSP Benign Ransomware Simulation Artifacts
     3. Ransomware Recovery Inhibition Batch / Script Dropper Indicators
     4. Suspicious Ransom Note & Double-Extortion Artifacts
*/

rule APEX_AV_EICAR_Standard_Test_File {
    meta:
        rule_id = "APEX-AV-EICAR-001"
        author = "ApexMSP Detection Engineering"
        severity = "high"
        confidence = "1.0"
        category = "malware"
        description = "Detects the standard EICAR antivirus test string for end-to-end pipeline verification"
        is_benign_simulation = true
    strings:
        $eicar_std = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*" ascii
        $eicar_alt = "X5O!P%@AP[4\\ZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*" ascii
        $eicar_sub = "EICAR-STANDARD-ANTIVIRUS-TEST-FILE" ascii
    condition:
        filesize < 10KB and ($eicar_std or $eicar_alt or $eicar_sub)
}

rule APEX_YARA_Benign_Ransomware_Simulation {
    meta:
        rule_id = "APEX-YARA-RANSOM-SIM"
        author = "ApexMSP Detection Engineering"
        severity = "critical"
        confidence = "0.99"
        category = "ransomware"
        mitre_attack = "T1486"
        description = "Detects benign ApexMSP ransomware simulation artifacts used in Purple-Team & Acceptance tests"
        is_benign_simulation = true
    strings:
        $marker1 = "APEXMSP-RANSOMWARE-SIMULATION-ARTIFACT" ascii wide
        $marker2 = "YOUR_FILES_HAVE_BEEN_ENCRYPTED_APEX_TEST" ascii wide
        $marker3 = "APEX-CANARY-TAMPER-TEST-PAYLOAD" ascii wide
    condition:
        filesize < 50MB and any of ($marker*)
}

rule APEX_EDR_Recovery_Inhibition_Script {
    meta:
        rule_id = "APEX-YARA-RI-SCRIPT"
        author = "ApexMSP Detection Engineering"
        severity = "critical"
        confidence = "0.96"
        category = "recovery_inhibition"
        mitre_attack = "T1490"
        description = "Detects batch, PowerShell, or script droppers containing multiple shadow copy & backup deletion commands"
    strings:
        $vss1 = "vssadmin delete shadows" ascii wide nocase
        $vss2 = "vssadmin.exe delete shadows" ascii wide nocase
        $vss3 = "vssadmin resize shadowstorage" ascii wide nocase
        $wmic = "wmic shadowcopy delete" ascii wide nocase
        $wbadmin = "wbadmin delete catalog" ascii wide nocase
        $bcd1 = "recoveryenabled no" ascii wide nocase
        $bcd2 = "bootstatuspolicy ignoreallfailures" ascii wide nocase
        $cipher = "cipher /w:" ascii wide nocase
    condition:
        filesize < 5MB and (2 of ($vss1, $vss2, $vss3, $wmic, $wbadmin, $bcd1, $bcd2, $cipher))
}
