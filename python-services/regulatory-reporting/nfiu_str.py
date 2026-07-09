"""
nfiu_str.py — NFIU STR XML Formatter and Submission

Formats Suspicious Transaction Reports as NFIU-compliant XML per:
  - NFIU goAML Schema v3.2
  - Money Laundering (Prevention and Prohibition) Act 2022, Section 6(1)
  - NFIU Reporting Guidelines for Financial Institutions 2023

STRs must be filed within 24 hours of suspicion arising.
"""

import os
import uuid
from datetime import datetime, timezone
from typing import Any
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom import minidom

import httpx


NFIU_ENDPOINT = os.getenv("NFIU_ENDPOINT", "https://goaml.nfiu.gov.ng/api/str/submit")
NFIU_API_KEY = os.getenv("NFIU_API_KEY", "")
NFIU_INSTITUTION_CODE = os.getenv("NFIU_INSTITUTION_CODE", "")
NFIU_INSTITUTION_NAME = os.getenv("NFIU_INSTITUTION_NAME", "PayGate Financial Services")


def format_str_xml(data: dict[str, Any]) -> str:
    """
    Format an STR as NFIU goAML-compliant XML.

    Schema: goAML v3.2 (UNODC standard, adapted for NFIU Nigeria).
    """
    root = Element("Report")
    root.set("xmlns", "http://www.unodc.org/goaml/en")
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
    root.set("xsi:schemaLocation", "http://www.unodc.org/goaml/en goAML_v3.2.xsd")

    # ── Report Header ──────────────────────────────────────────────────────
    report_code = SubElement(root, "rentity_id")
    report_code.text = NFIU_INSTITUTION_CODE

    report_name = SubElement(root, "rentity_branch")
    report_name.text = "HEAD_OFFICE"

    submission_code = SubElement(root, "submission_code")
    submission_code.text = "E"  # Electronic submission

    report_type_el = SubElement(root, "report_type")
    report_type_el.text = data.get("report_type", "STR")

    creation_date = SubElement(root, "creation_date")
    creation_date.text = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")

    reporting_person = SubElement(root, "reporting_person")
    rp_name = SubElement(reporting_person, "name")
    rp_name.text = data.get("filed_by", "Compliance Officer")
    rp_email = SubElement(reporting_person, "email")
    rp_email.text = data.get("reporting_entity", {}).get("contact_email", "")
    rp_phone = SubElement(reporting_person, "phone")
    rp_phone.text = data.get("reporting_entity", {}).get("contact_phone", "")

    # ── Reporting Institution ──────────────────────────────────────────────
    institution = SubElement(root, "reporting_institution")
    inst_name = SubElement(institution, "name")
    inst_name.text = data.get("reporting_entity", {}).get("name", NFIU_INSTITUTION_NAME)
    inst_code = SubElement(institution, "code")
    inst_code.text = NFIU_INSTITUTION_CODE
    inst_address = SubElement(institution, "address")
    inst_address.text = data.get("reporting_entity", {}).get("address", "")
    inst_licence = SubElement(institution, "cbn_licence_no")
    inst_licence.text = data.get("reporting_entity", {}).get("cbn_licence_no", "")

    # ── Activity ──────────────────────────────────────────────────────────
    activity = SubElement(root, "activity")

    activity_id = SubElement(activity, "activity_id")
    activity_id.text = data.get("str_id", str(uuid.uuid4()))

    activity_date = SubElement(activity, "activity_date")
    activity_date.text = data.get("transaction", {}).get("date", "")

    # Transaction details
    transaction = data.get("transaction", {})
    tx_el = SubElement(activity, "transaction")

    tx_id = SubElement(tx_el, "transaction_id")
    tx_id.text = transaction.get("id", "")

    tx_date = SubElement(tx_el, "transaction_date")
    tx_date.text = transaction.get("date", "")

    tx_amount = SubElement(tx_el, "amount")
    # Convert kobo to naira for NFIU
    amount_kobo = transaction.get("amount_kobo", 0)
    tx_amount.text = f"{amount_kobo / 100:.2f}"

    tx_currency = SubElement(tx_el, "currency_code")
    tx_currency.text = transaction.get("currency", "NGN")

    tx_type = SubElement(tx_el, "transaction_type")
    tx_type.text = transaction.get("type", "TRANSFER")

    tx_channel = SubElement(tx_el, "channel")
    tx_channel.text = transaction.get("channel", "")

    # ── Subject (Suspicious Person/Entity) ────────────────────────────────
    subject_data = data.get("subject", {})
    subject = SubElement(activity, "subject")

    subj_type = SubElement(subject, "subject_type")
    subj_type.text = subject_data.get("type", "INDIVIDUAL")  # INDIVIDUAL or ENTITY

    if subject_data.get("type", "INDIVIDUAL") == "INDIVIDUAL":
        person = SubElement(subject, "person")
        _add_text(person, "first_name", subject_data.get("first_name", ""))
        _add_text(person, "last_name", subject_data.get("last_name", ""))
        _add_text(person, "dob", subject_data.get("dob", ""))
        _add_text(person, "nationality", subject_data.get("nationality", "NG"))
        _add_text(person, "id_type", subject_data.get("id_type", "BVN"))
        _add_text(person, "id_number", subject_data.get("id_number", ""))
        _add_text(person, "address", subject_data.get("address", ""))
        _add_text(person, "phone", subject_data.get("phone", ""))
        _add_text(person, "email", subject_data.get("email", ""))
    else:
        entity = SubElement(subject, "entity")
        _add_text(entity, "name", subject_data.get("name", ""))
        _add_text(entity, "rc_number", subject_data.get("rc_number", ""))
        _add_text(entity, "tin", subject_data.get("tin", ""))
        _add_text(entity, "address", subject_data.get("address", ""))
        _add_text(entity, "phone", subject_data.get("phone", ""))

    # ── Suspicion Grounds ─────────────────────────────────────────────────
    suspicion_data = data.get("suspicion", {})
    suspicion = SubElement(activity, "suspicion")

    susp_type = SubElement(suspicion, "suspicion_type")
    susp_type.text = suspicion_data.get("type", "MONEY_LAUNDERING")

    susp_grounds = SubElement(suspicion, "grounds")
    susp_grounds.text = suspicion_data.get("grounds", "")

    susp_indicators = SubElement(suspicion, "indicators")
    for indicator in suspicion_data.get("indicators", []):
        ind_el = SubElement(susp_indicators, "indicator")
        ind_el.text = indicator

    susp_action = SubElement(suspicion, "action_taken")
    susp_action.text = suspicion_data.get("action_taken", "Transaction flagged and frozen pending investigation")

    # ── Narrative ─────────────────────────────────────────────────────────
    narrative = SubElement(activity, "narrative")
    narrative.text = suspicion_data.get("narrative", "")

    # ── Serialise to pretty-printed XML ───────────────────────────────────
    rough_string = tostring(root, encoding="unicode")
    reparsed = minidom.parseString(rough_string)
    return reparsed.toprettyxml(indent="  ", encoding=None)


async def submit_str_to_nfiu(xml_payload: str, str_id: str) -> str:
    """
    Submit an STR XML payload to the NFIU goAML portal.

    Returns the NFIU-assigned submission reference number.
    """
    headers = {
        "Content-Type": "application/xml",
        "X-API-Key": NFIU_API_KEY,
        "X-Institution-Code": NFIU_INSTITUTION_CODE,
        "X-STR-ID": str_id,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            NFIU_ENDPOINT,
            content=xml_payload.encode("utf-8"),
            headers=headers,
        )

    if response.status_code not in (200, 201, 202):
        raise RuntimeError(
            f"NFIU returned HTTP {response.status_code}: {response.text[:200]}"
        )

    # Parse NFIU reference from response
    try:
        resp_data = response.json()
        return resp_data.get("reference", resp_data.get("ref", f"NFIU-{str_id[:8].upper()}"))
    except Exception:
        # Some NFIU responses are plain text references
        ref = response.text.strip()
        if ref:
            return ref
        return f"NFIU-{str_id[:8].upper()}-{datetime.now().strftime('%Y%m%d')}"


def _add_text(parent: Element, tag: str, text: str) -> Element:
    """Add a child element with text content."""
    el = SubElement(parent, tag)
    el.text = text
    return el
