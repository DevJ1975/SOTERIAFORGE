"""The reserved platform tenant that holds shareable library courses.

It is an ordinary tenant row (status archived, so no tenant member can act in it)
that only superadmins reach, through `X-Forge-Tenant: library`.
"""

LIBRARY_TENANT_ID = "library"
