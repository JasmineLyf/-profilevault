import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Select from 'react-select';
function LocationSelect({
  id,
  label,
  options,
}: {
  id: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  const [value, setValue] = useState<{ value: string; label: string } | null>(null);
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <Select
        inputId={id}
        aria-label={label}
        options={options}
        value={value}
        onChange={(v) => setValue(v)}
      />
      <output id={id + '-state'}>{value?.value}</output>
    </>
  );
}
function ScrollingSchool() {
  const [open, setOpen] = useState(false),
    [scrolled, setScrolled] = useState(false),
    [value, setValue] = useState('');
  return (
    <fieldset>
      <legend>Scrolling choices</legend>
      <div
        id="scroll-school"
        data-combobox
        role="combobox"
        aria-label="School"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls="scroll-school-options"
        aria-valuetext={value}
        tabIndex={0}
        onClick={() => setOpen(true)}
      >
        {value || 'Select...'}
      </div>
      {open && (
        <div
          id="scroll-school-options"
          role="listbox"
          aria-label="School options"
          style={{ height: 60, overflowY: 'auto', border: '1px solid #333' }}
          onScroll={(e) => {
            if (e.currentTarget.scrollTop > 40) setScrolled(true);
          }}
        >
          <div style={{ height: 300 }}>
            {scrolled ? (
              <div
                role="option"
                aria-selected={false}
                onClick={() => {
                  setValue('Fictional University');
                  setOpen(false);
                }}
              >
                Fictional University
              </div>
            ) : (
              <div role="option" aria-selected={false}>
                Another University
              </div>
            )}
          </div>
        </div>
      )}
    </fieldset>
  );
}
function Fixture() {
  const [school, setSchool] = useState<{ value: string; label: string } | null>(null),
    [degree, setDegree] = useState<{ value: string; label: string } | null>(null),
    [submits, setSubmits] = useState(0),
    [filename, setFilename] = useState('');
  return (
    <main>
      <h1>虚构招聘表单 / Recruiting fixture</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmits((n) => n + 1);
        }}
      >
        <ScrollingSchool />
        <fieldset>
          <legend>Education</legend>
          <LocationSelect
            id="country"
            label="Country"
            options={[
              { value: 'cn', label: 'China' },
              { value: 'us', label: 'United States' },
            ]}
          />
          <LocationSelect
            id="city"
            label="City"
            options={[
              { value: 'bj', label: 'Beijing' },
              { value: 'sh', label: 'Shanghai' },
            ]}
          />
          <label htmlFor="school">School</label>
          <Select
            inputId="school"
            aria-label="School"
            name="school"
            options={[
              { value: 'fictional-u', label: 'Fictional University' },
              { value: 'other-u', label: 'Another University' },
            ]}
            value={school}
            onChange={(v) => setSchool(v)}
          />
          <label htmlFor="degree">Degree</label>
          <Select
            inputId="degree"
            aria-label="Degree"
            name="degree"
            isSearchable={false}
            options={[
              { value: 'bachelor', label: "Bachelor's Degree" },
              { value: 'master', label: "Master's Degree" },
              { value: 'md', label: 'Doctor of Medicine (M.D.)' },
              { value: 'phd', label: 'Doctor of Philosophy (Ph.D.)' },
              { value: 'jd', label: 'Juris Doctor (J.D.)' },
            ]}
            value={degree}
            onChange={(v) => setDegree(v)}
          />
          <label>
            Major
            <input id="major" />
          </label>
        </fieldset>
        <fieldset>
          <legend>Experience</legend>
          <label>
            Employer
            <input id="employer" />
          </label>
          <label>
            Role
            <input id="role" />
          </label>
          <label>
            Responsibilities
            <textarea id="responsibilities" />
          </label>
        </fieldset>
        <fieldset>
          <legend>Attachments</legend>
          <label>
            Resume / CV
            <input
              id="resume"
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => setFilename(e.currentTarget.files?.[0]?.name ?? '')}
            />
          </label>
          <output id="filename">{filename}</output>
        </fieldset>
        <label>
          验证码
          <input id="otp" />
        </label>
        <label>
          同意条款
          <input id="terms" type="checkbox" />
        </label>
        <button type="submit">Submit application</button>
      </form>
      <output id="school-state">{school?.label ?? ''}</output>
      <output id="degree-state">{degree?.value ?? ''}</output>
      <output id="submits">{submits}</output>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
